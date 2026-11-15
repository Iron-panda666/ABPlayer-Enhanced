<script lang="ts">
  import { onMount } from "svelte";
  import { isTauri } from "@tauri-apps/api/core";
  import { emitTo, listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import NowPlaying from "./lib/components/NowPlaying.svelte";
  import { IconButton } from "./lib/components/ui";
  import { type MiniCommand, type MiniState } from "./lib/desktop/miniPlayer";
  import { speedOptions } from "./lib/utils/speed";

  let state = $state<MiniState>({
    playing: false, loading: false, currentTime: 0, duration: 0,
    title: "", author: "", coverArt: null, chapter: "", previous: false, next: false,
    speed: 1, volume: 1, muted: false, sleepMinutes: "off", eq: "Flat", eqPresets: ["Flat"],
    error: null, isDark: true, primary: "#4db6ac", fontFamily: "editorial",
  });

  function send(command: MiniCommand) {
    void emitTo("main", "mini-player-command", command).catch(console.warn);
  }

  onMount(() => {
    if (!isTauri()) return;
    const unlisten = listen<MiniState>("mini-player-state", ({ payload }) => {
      state = payload;
    });
    void unlisten.then(() => send({ action: "ready" })).catch(console.warn);
    return () => { void unlisten.then((stop) => stop()).catch(console.warn); };
  });

  $effect(() => {
    document.documentElement.setAttribute("data-theme", state.isDark ? "dark" : "light");
    document.documentElement.setAttribute("data-font-family", state.fontFamily);
    document.documentElement.style.setProperty("--color-primary", state.primary);
  });

  const sleepOptions = [15, 30, 60];
  let np = $derived({
    ...state,
    title: state.title || "No book loaded",
    chapterLabel: state.chapter,
    canPlay: !!state.title,
  });
</script>

<div class="mp">
  <NowPlaying
    state={np}
    onplay={() => send({ action: "toggle-play" })}
    onskip={(seconds) => send({ action: seconds < 0 ? "skip-back" : "skip-forward" })}
    onstep={(direction) => send({ action: direction < 0 ? "previous" : "next" })}
    onseek={(value) => send({ action: "seek", value })}
  >
    {#snippet extraControls()}
      <div class="mp-controls">
        <label class="mp-control" title="Playback speed">
          <span class="material-symbols-outlined" aria-hidden="true">speed</span>
          <select aria-label="Playback speed" disabled={!np.canPlay} value={state.speed}
            onchange={(e) => send({ action: "speed", value: Number(e.currentTarget.value) })}>
            {#each speedOptions(state.speed) as speed (speed)}
              <option value={speed}>{speed}×</option>
            {/each}
          </select>
        </label>
        <div class="mp-control mp-volume">
          <button type="button" disabled={!np.canPlay} onclick={() => send({ action: "mute" })}
            aria-label={state.muted ? "Unmute" : "Mute"} title={state.muted ? "Unmute" : "Mute"}>
            <span class="material-symbols-outlined" aria-hidden="true">{state.muted ? "volume_off" : "volume_up"}</span>
          </button>
          <input type="range" min="0" max="100" value={Math.round(state.volume * 100)}
            disabled={!np.canPlay} aria-label="Volume"
            oninput={(e) => send({ action: "volume", value: e.currentTarget.valueAsNumber / 100 })} />
        </div>
        <label class="mp-control" title="Sleep timer">
          <span class="material-symbols-outlined" aria-hidden="true">dark_mode</span>
          <select aria-label="Sleep timer" disabled={!np.canPlay} value={state.sleepMinutes}
            onchange={(e) => {
              const choice = e.currentTarget.value;
              send({ action: "sleep", value: choice === "off" || choice === "chapter" ? choice : Number(choice) });
            }}>
            {#if typeof state.sleepMinutes === "number" && !sleepOptions.includes(state.sleepMinutes)}
              <option value={state.sleepMinutes} disabled>{state.sleepMinutes} min</option>
            {/if}
            <option value="off">Off</option>
            <option value="chapter">Chapter</option>
            {#each sleepOptions as minutes (minutes)}
              <option value={minutes}>{minutes} min</option>
            {/each}
          </select>
        </label>
        <label class="mp-control mp-eq" title="Equalizer preset">
          <span class="material-symbols-outlined" aria-hidden="true">equalizer</span>
          <select aria-label="Equalizer preset" disabled={!np.canPlay} value={state.eq}
            onchange={(e) => send({ action: "eq", value: e.currentTarget.value })}>
            {#if !state.eqPresets.includes(state.eq)}
              <option value={state.eq} disabled>{state.eq}</option>
            {/if}
            {#each state.eqPresets as preset (preset)}
              <option value={preset}>{preset}</option>
            {/each}
          </select>
        </label>
        <IconButton icon="bookmark_add" label="Add bookmark" size="1.9rem" disabled={!np.canPlay}
          onclick={() => send({ action: "bookmark" })} />
      </div>
    {/snippet}
  </NowPlaying>
  <button type="button" class="mp-close"
    onclick={() => void getCurrentWindow().close().catch(console.warn)}
    aria-label="Close the mini player" title="Close">
    <span class="material-symbols-outlined" aria-hidden="true">close</span>
  </button>
</div>

<style>
  :global(html:root) { font-size: 16px; }
  .mp { position: relative; width: 100%; height: 100%; overflow: hidden; }
  .mp-controls {
    display: grid;
    grid-template-columns: auto minmax(4rem, 1fr) auto minmax(5rem, 1fr) auto;
    align-items: stretch;
    gap: 0.3rem;
    min-width: 0;
  }
  .mp-control {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.21rem;
    padding: 0 0.28rem;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-md);
    color: var(--color-text-variant);
  }
  .mp-control > .material-symbols-outlined, .mp-volume button span { font-size: 0.98rem; }
  .mp-control select {
    min-width: 0;
    max-width: 100%;
    background: var(--color-surface);
    color: var(--color-text);
    border: none;
    font: 500 0.68rem/1 var(--font-label);
    cursor: pointer;
  }
  .mp-eq select { width: 100%; text-overflow: ellipsis; }
  .mp-volume input { width: 100%; min-width: 0; margin: 0; accent-color: var(--color-primary); }
  .mp-volume button, .mp-close {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    padding: 0.12rem;
    background: none;
    color: inherit;
    cursor: pointer;
  }
  .mp-close {
    position: absolute;
    top: 0.38rem;
    right: 0.38rem;
    border-radius: 50%;
    color: var(--color-text-variant);
  }
  .mp-close .material-symbols-outlined { font-size: 1rem; }
  .mp-close:hover, .mp-volume button:hover { color: var(--color-text); }
  .mp-volume button:disabled { opacity: 0.35; cursor: default; }
</style>
