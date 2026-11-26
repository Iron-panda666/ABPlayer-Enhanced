<script lang="ts">
  import { applyAudioSettings } from "../stores/audioStore";
  import { DEFAULT_AUDIO_SETTINGS } from "../stores/userdataStore";
  import type { AppTheme, AudioVisualization, FontScale, FontFamily, UserPreferences } from "../types";
  import { STREAM_DECK_SHORTCUTS } from "../desktop/streamDeck";
  import { setPreference } from "../stores/userdataStore";
  import { THEME_PRESETS } from "../themes";
  import { open as shellOpen } from "@tauri-apps/plugin-shell";
  import { libraryStore, rescan, clearSplits, restoreRemoved } from "../stores/libraryStore";

  import releaseInfo from "../../../release-info.json";
  const APP_VERSION = releaseInfo.releaseVersion;
  const CREATOR_NAME = "jhidalgo_dev";
  const COFFEE_URL = "https://buymeacoffee.com/jhidalgo_dev";

  function openExternal(url: string) {
    shellOpen(url);
  }

  interface Props {
    open: boolean;
    theme: AppTheme;
    colorTheme: string;
    fontScale: FontScale;
    fontFamily: FontFamily;
    reduceMotion: boolean;
    miniOpacity: number;
    audioVisualization: AudioVisualization;
    autoGroupFiles: boolean;
    desktop: Pick<UserPreferences, "trayIcon" | "closeToTray" | "trayClicks" | "streamDeckShortcuts">;
    onclose: () => void;
  }

  let {
    open, theme, colorTheme, fontScale, fontFamily, reduceMotion, miniOpacity, audioVisualization,
    autoGroupFiles, desktop, onclose,
  }: Props = $props();

  let removedCount = $derived(($libraryStore.hidden ?? []).length);

  async function setAutoGroup(on: boolean) {
    if (on === autoGroupFiles) return;
    await setPreference("autoGroupFiles", on);
    await rescan();
  }

  const themes: { value: AppTheme; label: string; icon: string }[] = [
    { value: "light", label: "Light", icon: "light_mode" },
    { value: "dark", label: "Dark", icon: "dark_mode" },
  ];

  const fontScales: { value: FontScale; label: string }[] = [
    { value: "compact", label: "Compact" },
    { value: "default", label: "Default" },
    { value: "large", label: "Large" },
  ];

  const fontFamilies: { value: FontFamily; label: string; hint: string }[] = [
    { value: "editorial", label: "Editorial", hint: "Newsreader + Manrope" },
    { value: "modern", label: "Modern", hint: "Source Serif + Inter" },
  ];
</script>

<svelte:window
  onkeydown={(e: KeyboardEvent) => {
    if (!open || e.key !== "Escape") return;
    e.preventDefault();
    onclose();
  }}
/>

{#if open}
  <button class="backdrop" onclick={onclose} aria-label="Close settings" tabindex="-1"></button>
  <aside class="panel">
    <div class="panel-header">
      <h2>Settings</h2>
      <button class="close-btn" onclick={onclose}>
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <div class="section">
      <h3 class="section-label">Theme</h3>
      <div class="option-row">
        {#each themes as t}
          <button
            class="option-btn"
            class:active={theme === t.value}
            onclick={() => setPreference("theme", t.value)}
          >
            <span class="material-symbols-outlined" style="font-size:18px;">{t.icon}</span>
            {t.label}
          </button>
        {/each}
      </div>
      <label class="desktop-option opacity-option">
        <span>Mini player opacity</span>
        <input type="range" min="50" max="100" value={miniOpacity}
          aria-valuetext={`${miniOpacity}% opacity`}
          onchange={(e) => setPreference("miniOpacity", e.currentTarget.valueAsNumber)} />
        <span class="mono" aria-hidden="true">{miniOpacity}%</span>
      </label>
    </div>

    <div class="section">
      <h3 class="section-label">Color</h3>
      <div class="color-row">
        {#each THEME_PRESETS as preset}
          <button
            class="color-swatch"
            class:active={colorTheme === preset.id}
            style:background={theme === "dark" ? preset.dark.primary : preset.light.primary}
            onclick={() => setPreference("colorTheme", preset.id)}
            title={preset.name}
          >
            {#if colorTheme === preset.id}
              <span class="material-symbols-outlined swatch-check" style="font-size:14px; font-variation-settings: 'FILL' 1;">check</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <div class="section">
      <h3 class="section-label">Font Size</h3>
      <div class="option-row">
        {#each fontScales as fs}
          <button
            class="option-btn"
            class:active={fontScale === fs.value}
            onclick={() => setPreference("fontScale", fs.value)}
          >
            {fs.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="section">
      <h3 class="section-label">Font Family</h3>
      <div class="option-col">
        {#each fontFamilies as ff}
          <button
            class="family-btn"
            class:active={fontFamily === ff.value}
            onclick={() => setPreference("fontFamily", ff.value)}
          >
            <span class="family-label">{ff.label}</span>
            <span class="family-hint">{ff.hint}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="section">
      <h3 class="section-label">Motion</h3>
      <p class="section-hint">
        Turns off hover lifts, the cover flight into the player, drop overshoot and
        shimmer. Play/pause, progress and spinners keep working. Your system's
        "reduce motion" setting already forces this on.
      </p>
      <div class="option-row">
        <button
          class="option-btn"
          class:active={!reduceMotion}
          onclick={() => setPreference("reduceMotion", false)}
        >Full motion</button>
        <button
          class="option-btn"
          class:active={reduceMotion}
          onclick={() => setPreference("reduceMotion", true)}
        >Reduce motion</button>
      </div>
    </div>

    <div class="section">
      <h3 class="section-label">Windows notification area</h3>
      <label class="desktop-option">
        <input type="checkbox" checked={desktop.trayIcon}
          onchange={(e) => setPreference("trayIcon", e.currentTarget.checked)} />
        Show ABPlayer next to the clock
      </label>
      <label class="desktop-option">
        <input type="checkbox" checked={desktop.closeToTray} disabled={!desktop.trayIcon}
          onchange={(e) => setPreference("closeToTray", e.currentTarget.checked)} />
        Hide the main window when I click ×
      </label>
      <label class="desktop-option">
        Open mini player with
        <select disabled={!desktop.trayIcon} value={desktop.trayClicks}
          onchange={(e) => setPreference("trayClicks", e.currentTarget.value === "2" ? 2 : 1)}>
          <option value={1}>Single click</option>
          <option value={2}>Double click</option>
        </select>
      </label>
      <p class="section-hint">Use the same click gesture again to return to the main window. Right-click for the tray menu.</p>
    </div>

    <div class="section">
      <h3 class="section-label">Stream Deck</h3>
      <label class="desktop-option">
        <input type="checkbox" checked={desktop.streamDeckShortcuts}
          onchange={(e) => setPreference("streamDeckShortcuts", e.currentTarget.checked)} />
        Enable global Stream Deck shortcuts
      </label>
      {#if desktop.streamDeckShortcuts}
        <dl class="shortcut-list">
          {#each STREAM_DECK_SHORTCUTS as shortcut (shortcut.key)}
            <dt>{shortcut.label}</dt>
            <dd><kbd>Ctrl+Alt+Shift+{shortcut.key}</kbd></dd>
          {/each}
        </dl>
      {/if}
    </div>

    <div class="section">
      <h3 class="section-label">Chapter files</h3>
      <p class="section-hint">
        Books stored as one file per chapter: loose files in a library folder that share an album
        tag, or a file name once the numbering is removed, are shown as one book. A subfolder of
        files is always one book. Changing this rescans the library.
      </p>
      <div class="option-row">
        <button class="option-btn" class:active={autoGroupFiles} onclick={() => setAutoGroup(true)}>
          Group into books
        </button>
        <button class="option-btn" class:active={!autoGroupFiles} onclick={() => setAutoGroup(false)}>
          Keep files separate
        </button>
      </div>
      {#if ($libraryStore.splitKeys ?? []).length > 0}
        <div class="option-row">
          <button class="option-btn" onclick={clearSplits}>
            Regroup the books I split
          </button>
        </div>
      {/if}
    </div>

    <div class="section">
      <h3 class="section-label">Removed books</h3>
      <p class="section-hint">
        A book you remove from the library stays out of it, even though its files are still in
        the folder.
        {#if removedCount === 0}
          Nothing is being kept out at the moment.
        {:else}
          {removedCount} {removedCount === 1 ? "file or book folder is" : "files or book folders are"}
          being kept out.
        {/if}
      </p>
      {#if removedCount > 0}
        <div class="option-row">
          <button class="option-btn" onclick={restoreRemoved}>
            Bring removed books back
          </button>
        </div>
      {/if}
    </div>

    <div class="section">
      <h3 class="section-label">Audio</h3>
      <label class="desktop-option">
        <span>Playback visualization</span>
        <select value={audioVisualization}
          onchange={(e) => setPreference("audioVisualization", e.currentTarget.value as AudioVisualization)}>
          <option value="off">Off</option>
          <option value="spectrum">Spectrum</option>
          <option value="oscilloscope">Oscilloscope</option>
          <option value="levels">Level meter</option>
        </select>
      </label>
      <p class="section-hint">
        Playback speed, volume, mute and the equalizer are remembered between sessions.
      </p>
      <div class="option-row">
        <button class="option-btn" onclick={() => applyAudioSettings(DEFAULT_AUDIO_SETTINGS, true)}>
          Reset to defaults
        </button>
      </div>
    </div>

    <div class="section about-section">
      <h3 class="section-label">About</h3>
      <div class="about-card">
        <div class="about-header">
          <span class="material-symbols-outlined about-icon">headphones</span>
          <div>
            <p class="about-name">ABPlayer-Enhanced</p>
            <p class="about-version">v{APP_VERSION}</p>
          </div>
        </div>
        <p class="about-desc">A modern desktop audiobook player with chapter navigation, position saving, and library management.</p>
        <div class="about-links">
          <p class="about-creator">
            <span class="material-symbols-outlined" style="font-size:14px;">person</span>
            Original ABPlayer {releaseInfo.upstreamVersion} by Jose Hidalgo ({CREATOR_NAME} / kurohige)
          </p>
          <button class="coffee-btn" onclick={() => openExternal(COFFEE_URL)}>
            <span class="material-symbols-outlined" style="font-size:16px;">coffee</span>
            Buy Me a Coffee
          </button>
        </div>
        <p class="about-creator">Enhanced changes by Jiří Veselý, aka Iron-panda666.</p>
        <p class="about-creator">Unofficial fork, shared with the original author's permission.</p>
        <p class="about-creator">Developed with AI-assisted vibe coding using OpenAI Codex.</p>
      </div>
    </div>
  </aside>
{/if}

<style>
  .desktop-option {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-height: 1.9rem;
    font-size: var(--font-size-sm);
  }
  .desktop-option input { accent-color: var(--color-primary); }
  .opacity-option { margin-top: 0.5rem; }
  .opacity-option input { flex: 1; min-width: 3rem; }
  .opacity-option .mono { min-width: 4ch; text-align: right; }
  .desktop-option select {
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-md);
    padding: 0.25rem;
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
  }
  .shortcut-list { display: grid; grid-template-columns: 1fr auto; gap: 0.25rem; font-size: var(--font-size-sm); }
  .shortcut-list dd { margin: 0; }
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 90;
    border: none;
    padding: 0;
    margin: 0;
    cursor: default;
  }

  .panel {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 260px;
    max-width: 80vw;
    background: var(--color-surface);
    z-index: 91;
    padding: var(--spacing-lg) var(--spacing-md);
    overflow-y: auto;
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.15);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-lg);
  }

  .panel-header h2 {
    font-family: var(--font-headline);
    font-size: var(--font-size-lg);
    font-weight: 500;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--color-text-variant);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-md);
  }

  .close-btn:hover {
    color: var(--color-text);
  }

  .close-btn .material-symbols-outlined {
    font-size: 20px;
  }

  .section {
    margin-bottom: var(--spacing-lg);
  }

  .section-label {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-variant);
    margin-bottom: var(--spacing-sm);
  }

  .option-row {
    display: flex;
    gap: 4px;
  }

  .option-col {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .family-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    padding: 0.5rem 0.8rem;
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text-variant);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    text-align: left;
  }

  .family-btn:hover { background: var(--color-surface-highest); }

  .family-btn.active {
    background: var(--color-primary);
    color: var(--color-on-primary);
  }

  .family-label {
    font-family: var(--font-headline);
    font-size: var(--font-size-sm);
    font-weight: 600;
  }

  .section-hint {
    font-family: var(--font-body);
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
    line-height: 1.45;
    margin: 0 0 0.6rem;
  }

  .family-hint {
    font-family: var(--font-label);
    font-size: 0.6rem;
    letter-spacing: 0.05em;
    opacity: 0.75;
  }

  .option-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text-variant);
    padding: 7px 10px;
    border-radius: var(--radius-lg);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .option-btn:hover {
    background: var(--color-surface-highest);
  }

  .option-btn.active {
    background: var(--color-primary);
    color: var(--color-on-primary);
  }

  .color-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .color-swatch {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.15s, transform 0.15s;
  }

  .color-swatch:hover {
    transform: scale(1.1);
  }

  .color-swatch.active {
    border-color: var(--color-text);
  }

  .swatch-check {
    color: #fff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .about-section {
    margin-top: auto;
    padding-top: var(--spacing-lg);
    border-top: 1px solid var(--color-outline-variant);
  }

  .about-card {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .about-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .about-icon {
    font-size: 28px;
    color: var(--color-primary);
    font-variation-settings: "FILL" 1;
  }

  .about-name {
    font-family: var(--font-headline);
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--color-text);
  }

  .about-version {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-outline);
  }

  .about-desc {
    font-family: var(--font-body);
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
    line-height: 1.5;
  }

  .about-links {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-xs);
  }

  .about-creator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
  }

  .coffee-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    padding: 8px 14px;
    border-radius: var(--radius-xl);
    cursor: pointer;
    transition: background 0.15s, transform 0.15s;
    width: fit-content;
  }

  .coffee-btn:hover {
    background: var(--color-surface-highest);
    transform: translateY(-1px);
  }

  .coffee-btn:active {
    transform: translateY(0);
  }
</style>
