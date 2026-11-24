<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { getCurrentWindow, monitorFromPoint } from "@tauri-apps/api/window";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
  import { emitTo, listen } from "@tauri-apps/api/event";
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
  import Library from "./lib/components/Library.svelte";
  import PlayerView from "./lib/components/PlayerView.svelte";
  import TiersView from "./lib/components/TiersView.svelte";
  import SettingsPanel from "./lib/components/SettingsPanel.svelte";
  import Toast from "./lib/components/Toast.svelte";
  import ShortcutsSheet from "./lib/components/ShortcutsSheet.svelte";
  import { showToast } from "./lib/stores/toastStore";
  import { initMediaSession } from "./lib/stores/mediaSession";
  import { audioStore, togglePlay, skip, seek, undoSeek, setVolume, toggleMute, applyAudioSettings, chapterNavigation, stepChapter, setSpeed, applyEqPreset, setSleepTimer, setSleepEndOfChapter, cancelSleepTimer } from "./lib/stores/audioStore";
  import { userdataStore, loadUserData, getDisplayTitle, getDisplayAuthor, getDisplayCover } from "./lib/stores/userdataStore";
  import { loadBookmarks } from "./lib/stores/bookmarkStore";
  import { loadStatistics } from "./lib/stores/statisticsStore";
  import { loadTierLists } from "./lib/stores/tierListStore";
  import { THEME_PRESETS } from "./lib/themes";
  import { initTray } from "./lib/desktop/tray";
  import { initStreamDeckShortcuts, markCurrentPosition } from "./lib/desktop/streamDeck";
  import { MINI_HEIGHT, MINI_WIDTH, isUndoSeekShortcut, type MiniCommand, type MiniState } from "./lib/desktop/miniPlayer";
  import { BUILT_IN_EQ_PRESETS, findPreset } from "./lib/utils/eqPresets";
  import type { AppView } from "./lib/types";

  let activeView = $state<AppView>("library");
  let settingsOpen = $state(false);
  let shortcutsOpen = $state(false);

  // Track which book triggered the last auto-nav, so we only switch once per new book
  let lastAutoNavBook = $state<string | null>(null);

  onMount(() => {
    // Restore remembered speed / volume / mute / EQ once preferences are in
    loadUserData().then(() => applyAudioSettings(get(userdataStore).preferences.audio));
    loadBookmarks();
    loadStatistics();
    loadTierLists();
    // Media keys and the system media overlay follow the audio store from here on
    initMediaSession();

    window.addEventListener("keydown", (e) => {
      if (isUndoSeekShortcut(e) && undoSeek()) e.preventDefault();
      // Don't handle shortcuts when typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.defaultPrevented || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case "Escape":
          // Whatever is open — a menu, a dialog, the settings sheet — gets the
          // key first and marks it handled. Those listeners were added after
          // this one, so decide once they have all run. A task, not a
          // microtask: the browser runs microtasks between event listeners.
          setTimeout(() => {
            if (e.defaultPrevented) return;
            if (shortcutsOpen) shortcutsOpen = false;
            else if (activeView !== "library") activeView = "library";
          }, 0);
          break;
        case "?":
          e.preventDefault();
          shortcutsOpen = !shortcutsOpen;
          break;
        case " ":
          e.preventDefault();
          if ($audioStore.currentBook) togglePlay();
          break;
        case "ArrowLeft":
          if ($audioStore.currentBook) skip(-30);
          break;
        case "ArrowRight":
          if ($audioStore.currentBook) skip(30);
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume(Math.min(1, $audioStore.volume + 0.05));
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume(Math.max(0, $audioStore.volume - 0.05));
          break;
        case "m":
        case "M":
          toggleMute();
          break;
      }
    });

    if (!isTauri()) return;
    void invoke<{ startupNotice: string | null }>("profile_restore_status").then((status) => {
      if (status?.startupNotice) showToast(status.startupNotice, "restore");
    }).catch(console.warn);
    const stopTray = initTray(openMiniPlayer).catch((error) => {
      console.warn("Could not initialize the tray:", error);
    });
    const stopStreamDeck = initStreamDeckShortcuts();
    register("CommandOrControl+Shift+P", (e) => {
      if (e.state === "Pressed" && $audioStore.currentBook && !$audioStore.currentBook.fileless) togglePlay();
    }).catch((e) => console.warn("Failed to register Ctrl+Shift+P:", e));
    register("CommandOrControl+Shift+M", (e) => {
      if (e.state === "Pressed") void openMiniPlayer().catch(console.warn);
    }).catch((e) => console.warn("Failed to register Ctrl+Shift+M:", e));
    const abort = new AbortController();
    window.addEventListener("beforeunload", () => {
      unregisterAll().catch(() => {});
    }, { once: true, signal: abort.signal });
    const unlisten = listen<MiniCommand>("mini-player-command", ({ payload }) => {
      if (payload.action === "ready") {
        miniReady = true;
        sendMiniState();
        return;
      }
      const book = get(audioStore).currentBook;
      if (!book || book.fileless) return;
      switch (payload.action) {
        case "toggle-play": togglePlay(); break;
        case "skip-forward": skip(30); break;
        case "skip-back": skip(-30); break;
        case "previous": stepChapter(-1); break;
        case "next": stepChapter(1); break;
        case "undo-seek": undoSeek(); break;
        case "seek": if (Number.isFinite(payload.value)) seek(payload.value); break;
        case "volume": if (Number.isFinite(payload.value)) setVolume(payload.value); break;
        case "speed": if (payload.value >= 0.25 && payload.value <= 4) setSpeed(payload.value); break;
        case "mute": toggleMute(); break;
        case "bookmark": void markCurrentPosition(); break;
        case "sleep":
          if (payload.value === "off") cancelSleepTimer();
          else if (payload.value === "chapter") setSleepEndOfChapter();
          else if ([15, 30, 60].includes(payload.value)) setSleepTimer(payload.value);
          break;
        case "eq": {
          const preset = [...BUILT_IN_EQ_PRESETS, ...get(userdataStore).preferences.eqPresets]
            .find((option) => option.name === payload.value);
          if (preset) applyEqPreset(preset);
          break;
        }
      }
    });
    return () => {
      abort.abort();
      stopStreamDeck();
      void stopTray.then((stop) => stop?.());
      void unlisten.then((stop) => stop()).catch(console.warn);
    };
  });

  let miniReady = $state(false);
  let miniTimer: ReturnType<typeof setTimeout> | undefined;
  let miniOpening: Promise<void> | null = null;
  let miniState = $derived.by((): MiniState => {
    const audio = $audioStore;
    const book = audio.currentBook?.fileless ? null : audio.currentBook;
    const prefs = $userdataStore.preferences;
    const ud = book ? $userdataStore.books[book.filePath] : undefined;
    const navigation = chapterNavigation(audio);
    const preset = THEME_PRESETS.find((theme) => theme.id === prefs.colorTheme) ?? THEME_PRESETS[0];
    const isDark = prefs.theme === "dark";
    const eq = findPreset(prefs.eqPresets, { bass: audio.eqBass, mid: audio.eqMid, treble: audio.eqTreble });
    const sleepMinutes = audio.sleepTimerMode === "end-of-chapter" ? "chapter"
      : audio.sleepTimerRemaining !== null ? Math.max(1, Math.ceil(audio.sleepTimerRemaining / 60)) : "off";
    return {
      playing: !!book && audio.playing, loading: !!book && audio.loading,
      currentTime: book ? audio.currentTime : 0, duration: book ? audio.duration : 0,
      title: book ? getDisplayTitle(book, ud) : "",
      author: book ? getDisplayAuthor(book, ud) : "",
      coverArt: book ? getDisplayCover(book, ud) : null,
      chapter: audio.totalTracks > 1 ? `Track ${audio.currentTrackIndex + 1} of ${audio.totalTracks}`
        : audio.currentChapterIndex >= 0 ? `Ch ${audio.currentChapterIndex + 1} of ${audio.chapters.length}` : "",
      previous: navigation.previous, next: navigation.next,
      canUndoSeek: !!audio.seekUndo,
      speed: audio.speed, volume: audio.volume, muted: audio.muted, sleepMinutes,
      eq: eq?.name ?? "Custom", eqPresets: [...BUILT_IN_EQ_PRESETS, ...prefs.eqPresets].map((option) => option.name),
      error: book ? audio.error : null, isDark, primary: (isDark ? preset.dark : preset.light).primary,
      fontFamily: prefs.fontFamily,
      opacity: prefs.miniOpacity,
    };
  });

  function sendMiniState(state = miniState) {
    void emitTo("mini-player", "mini-player-state", state).catch(console.warn);
  }

  $effect(() => {
    if (!miniReady) return;
    const state = miniState;
    if (!miniTimer) {
      miniTimer = setTimeout(() => {
        miniTimer = undefined;
        if (miniReady) sendMiniState();
      }, state.loading ? 0 : 180);
    }
  });

  function openMiniPlayer(anchor?: PhysicalPosition): Promise<void> {
    miniOpening ??= showMiniPlayer(anchor).finally(() => { miniOpening = null; });
    return miniOpening;
  }

  async function showMiniPlayer(anchor?: PhysicalPosition) {
    const existing = await WebviewWindow.getByLabel("mini-player");
    if (existing) {
      await existing.show();
      await existing.setFocus();
      return;
    }
    miniReady = false;
    const mini = new WebviewWindow("mini-player", {
      url: "/mini-player.html", title: "ABPlayer-Enhanced Mini", width: MINI_WIDTH, height: MINI_HEIGHT,
      resizable: false, alwaysOnTop: true, decorations: false, transparent: true, shadow: false, skipTaskbar: true,
      visible: false,
    });
    await new Promise<void>((resolve, reject) => {
      void mini.once("tauri://error", (event) => reject(event.payload));
      void mini.once("tauri://created", () => resolve());
    });
    void mini.once("tauri://destroyed", () => { miniReady = false; }).catch(console.warn);
    try {
      await mini.setSize(new LogicalSize(MINI_WIDTH, MINI_HEIGHT));
      const monitor = anchor ? await monitorFromPoint(anchor.x, anchor.y) : null;
      if (monitor) {
        const area = monitor.workArea;
        const x = area.position.x + area.size.width - Math.ceil((MINI_WIDTH + 12) * monitor.scaleFactor);
        const y = area.position.y + area.size.height - Math.ceil((MINI_HEIGHT + 12) * monitor.scaleFactor);
        await mini.setPosition(new PhysicalPosition(Math.max(area.position.x, x), Math.max(area.position.y, y)));
      }
    } catch (error) {
      console.warn("Could not position the mini player:", error);
    }
    await mini.show();
    await mini.setFocus();
  }

  // Auto-switch to player only when a NEW book is loaded (not when returning from library)
  $effect(() => {
    const book = $audioStore.currentBook;
    if (book && book.filePath !== lastAutoNavBook) {
      lastAutoNavBook = book.filePath;
      activeView = "player";
      const ud = $userdataStore.books[book.filePath];
      showToast(ud?.titleOverride || book.title, "play_circle");
    }
  });

  // Toast when a book is finished
  let lastBookStatus = $state<string | null>(null);
  $effect(() => {
    const book = $audioStore.currentBook;
    if (!book) return;
    const ud = $userdataStore.books[book.filePath];
    const status = ud?.status || "not_started";
    if (status === "finished" && lastBookStatus !== "finished") {
      showToast("Book finished!", "check_circle");
    }
    lastBookStatus = status;
  });

  // Apply theme + font scale + color theme
  $effect(() => {
    const prefs = $userdataStore.preferences;
    document.documentElement.setAttribute("data-theme", prefs.theme || "dark");
    // Reduced motion: the preference forces it on; otherwise follow the OS
    const osReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.setAttribute(
      "data-reduce-motion",
      prefs.reduceMotion || osReduce ? "on" : "off",
    );
    document.documentElement.setAttribute("data-font", prefs.fontScale || "default");
    document.documentElement.setAttribute("data-font-family", prefs.fontFamily || "editorial");

    // Apply color theme preset
    const preset = THEME_PRESETS.find((t) => t.id === prefs.colorTheme) || THEME_PRESETS[0];
    const colors = prefs.theme === "dark" ? preset.dark : preset.light;
    const root = document.documentElement.style;
    root.setProperty("--color-primary", colors.primary);
    root.setProperty("--color-primary-container", colors.primaryContainer);
    root.setProperty("--color-primary-fixed-dim", colors.primaryFixedDim);
    root.setProperty("--color-on-primary", colors.onPrimary);
    root.setProperty("--color-on-primary-container", colors.onPrimaryContainer);
  });

  // Update window title with book progress
  let lastTitlePct = $state(-1);
  $effect(() => {
    const book = $audioStore.currentBook;
    if (book && $audioStore.duration > 0) {
      const pct = Math.round(($audioStore.currentTime / $audioStore.duration) * 100);
      if (pct !== lastTitlePct) {
        lastTitlePct = pct;
        const userData = $userdataStore.books[book.filePath];
        const name = getDisplayTitle(book, userData);
        getCurrentWindow().setTitle(`${name} \u2014 ${pct}% | ABPlayer-Enhanced`);
      }
    } else if (lastTitlePct !== -1) {
      lastTitlePct = -1;
      getCurrentWindow().setTitle("ABPlayer-Enhanced");
    }
  });
</script>

<main class="app">
  <!-- Left sidebar navigation (desktop standard) -->
  <nav class="sidebar">
    <button class="sidebar-btn" class:active={activeView === "library"} onclick={() => (activeView = "library")} title="Library">
      <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' {activeView === 'library' ? 1 : 0};">library_books</span>
    </button>
    <button class="sidebar-btn" class:active={activeView === "player"} onclick={() => (activeView = "player")} title="Now Playing" disabled={!$audioStore.currentBook}>
      <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' {activeView === 'player' ? 1 : 0};">headphones</span>
    </button>
    <button class="sidebar-btn" class:active={activeView === "tiers"} onclick={() => (activeView = "tiers")} title="Tiers">
      <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' {activeView === 'tiers' ? 1 : 0};">format_list_numbered</span>
    </button>
    <div class="sidebar-spacer"></div>
    <button class="sidebar-btn" onclick={() => (settingsOpen = true)} title="Settings">
      <span class="material-symbols-outlined">settings</span>
    </button>
  </nav>

  <div class="app-main">
    <div class="app-content">
      {#if activeView === "library"}
        <Library
          onnavtoplayer={() => (activeView = "player")}
        />
      {:else if activeView === "tiers"}
        <TiersView />
      {:else}
        <PlayerView onback={() => (activeView = "library")}
          onminiplayer={() => void openMiniPlayer().catch(console.warn)} />
      {/if}
    </div>

    <!-- No bottom play bar (handoff 1a): the library's continue card is the
         docked player, and the sidebar's headphones opens the full one. -->
  </div>

  <SettingsPanel
    open={settingsOpen}
    theme={$userdataStore.preferences.theme || "dark"}
    colorTheme={$userdataStore.preferences.colorTheme || "teal"}
    fontScale={$userdataStore.preferences.fontScale || "default"}
    fontFamily={$userdataStore.preferences.fontFamily || "editorial"}
    reduceMotion={$userdataStore.preferences.reduceMotion}
    miniOpacity={$userdataStore.preferences.miniOpacity}
    audioVisualization={$userdataStore.preferences.audioVisualization}
    autoGroupFiles={$userdataStore.preferences.autoGroupFiles !== false}
    desktop={$userdataStore.preferences}
    onclose={() => (settingsOpen = false)}
  />

  {#if shortcutsOpen}
    <ShortcutsSheet onclose={() => (shortcutsOpen = false)} />
  {/if}

  <Toast />
</main>

<style>
  .app {
    display: flex;
    height: 100vh;
  }

  /* Left sidebar navigation */
  .sidebar {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 3.5rem;
    padding: 0.75rem 0;
    gap: 0.25rem;
    background: var(--color-surface);
    border-right: 1px solid var(--color-outline-variant);
    flex-shrink: 0;
  }

  .sidebar-btn {
    width: 2.5rem;
    height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--color-text-variant);
    cursor: pointer;
    border-radius: var(--radius-lg);
    transition: color 0.15s, background 0.15s;
  }

  .sidebar-btn:hover {
    background: var(--color-surface-high);
    color: var(--color-text);
  }

  .sidebar-btn.active {
    color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  }

  .sidebar-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .sidebar-btn .material-symbols-outlined {
    font-size: 1.4rem;
  }

  .sidebar-spacer {
    flex: 1;
  }

  .app-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .app-content {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;
  }

  /* Every view fills the content area and may shrink below its content: a
     flex item's default min-width is its min-content width, and the library
     header's non-wrapping controls would otherwise hold the whole column at
     ~600px, with the card and grid laid out past the window's edge (handoff:
     "the header clips, the search field shrinks").
     Entrance is a fade only: a transform here would move the cover the
     flight is measuring its landing spot against (utils/coverFlight.ts). */
  .app-content > :global(*) {
    flex: 1;
    min-width: 0;
    animation: ab-fade var(--motion-overlay) var(--ease-out) both;
  }

</style>
