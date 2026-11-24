<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { invoke } from "@tauri-apps/api/core";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { audioStore, getAudioElement } from "../../stores/audioStore";
  import { savePosition } from "../../stores/positionStore";
  import Modal from "../Modal.svelte";
  import { Pill } from "../ui";

  interface Preview {
    createdAt: string;
    books: number;
    bookmarks: number;
    folders: string[];
  }

  let { onclose }: { onclose: () => void } = $props();
  const filters = [{ name: "ABPlayer backup", extensions: ["abplayer-backup"] }];
  let preview = $state<Preview | null>(null);
  let mappings = $state<Record<string, string>>({});
  let busy = $state(true);
  let pending = $state(false);
  let notice = $state("");
  let failure = $state("");
  let automaticBackupFolder = $state<string | null>(null);

  onMount(() => {
    void run(async () => {
      const status = await invoke<{ pending: boolean; startupNotice: string | null; automaticBackupFolder: string | null }>("profile_restore_status");
      pending = status.pending;
      notice = status.startupNotice ?? "";
      automaticBackupFolder = status.automaticBackupFolder ?? null;
    });
  });

  async function run(action: () => Promise<void>) {
    busy = true;
    failure = "";
    try { await action(); }
    catch (error) { failure = error instanceof Error ? error.message : String(error); }
    finally { busy = false; }
  }

  function createBackup() {
    void run(async () => {
      const createdAt = new Date().toISOString();
      const path = await save({ title: "Create an ABPlayer backup", filters,
        defaultPath: `ABPlayer-${createdAt.slice(0, 10)}.abplayer-backup` });
      if (!path) return;
      const state = get(audioStore);
      if (state.currentBook && !state.currentBook.fileless) {
        const position = getAudioElement().currentTime;
        if (position > 0 || state.currentTrackIndex > 0 || state.seekUndo) {
          await savePosition(state.currentBook.filePath, position, state.duration, state.currentTrackIndex);
        }
      }
      await invoke("create_profile_backup", { path, createdAt });
      notice = "Backup saved";
    });
  }

  function chooseBackup() {
    void run(async () => {
      const path = await open({ title: "Choose an ABPlayer backup", multiple: false, filters,
        defaultPath: automaticBackupFolder ?? undefined });
      if (typeof path !== "string") return;
      preview = await invoke<Preview>("inspect_profile_backup", { path });
      mappings = {};
      notice = "";
    });
  }

  function chooseFolder(from: string) {
    void run(async () => {
      const to = await open({ title: "Choose the new location of this audiobook folder", directory: true, multiple: false });
      if (typeof to === "string") mappings[from] = to;
    });
  }

  function scheduleRestore() {
    void run(async () => {
      await invoke("schedule_profile_restore", {
        mappings: Object.entries(mappings).map(([from, to]) => ({ from, to })),
      });
      pending = true;
      preview = null;
      notice = "";
    });
  }

  function cancelRestore() {
    void run(async () => {
      await invoke("cancel_profile_restore");
      pending = false;
      notice = "Scheduled restore canceled";
    });
  }

  function close() { if (!busy) onclose(); }

  function formatDate(date: string): string {
    const timestamp = new Date(date);
    return Number.isFinite(+timestamp) ? timestamp.toLocaleString() : date;
  }
</script>

<Modal onclose={close} label="Back up or restore your library" maxWidth="34rem">
  <div class="backup-dialog">
    <h2>Backup and restore</h2>
    <p>Back up your library, listening positions, bookmarks, covers and settings in one file. Keep your audio files in their own folders.</p>
    {#if automaticBackupFolder}
      <p>Setup keeps the last 3 automatic profile backups here: <span class="backup-path">{automaticBackupFolder}</span>. Manual backups are kept separately and are not automatically deleted. Choose a backup below to restore it.</p>
    {/if}
    {#if notice}<p class="feedback" role="status">{notice}</p>{/if}
    {#if failure}<p class="failure" role="alert">{failure}</p>{/if}
    {#if pending}
      <p class="feedback" role="status">Restore scheduled. Quit ABPlayer-Enhanced and reopen it to apply the backup. Your current profile will be kept as a safety copy.</p>
      <div class="actions">
        <Pill label="Cancel scheduled restore" disabled={busy} onclick={cancelRestore} />
      </div>
    {:else if preview}
      <div class="preview">
        <p><strong>{preview.books} {preview.books === 1 ? "book" : "books"}</strong>
          · {preview.bookmarks} {preview.bookmarks === 1 ? "bookmark" : "bookmarks"}
          · {formatDate(preview.createdAt)}</p>
        {#if preview.folders.length}
          <h3>Audiobook folders</h3>
          <p>Choose new locations for any folders that have moved.</p>
          <ul>
            {#each [...new Set(preview.folders)] as folder (folder)}
              <li>
                <div class="paths">
                  <span title={folder}>{folder}</span>
                  {#if mappings[folder]}
                    <span class="replacement" title={mappings[folder]}>{mappings[folder]}</span>
                  {/if}
                </div>
                <Pill label="Choose folder" height="1.8rem" disabled={busy}
                  title={`Choose a replacement for ${folder}`} onclick={() => chooseFolder(folder)} />
                {#if mappings[folder]}
                  <Pill label="Reset" height="1.8rem" disabled={busy} onclick={() => { delete mappings[folder]; }} />
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <p>On the next launch, the backup will replace the current library, preferences and listening data. ABPlayer will keep a safety copy of the current profile.</p>
      <div class="actions">
        <Pill label="Back" disabled={busy} onclick={() => { preview = null; failure = ""; }} />
        <Pill label="Restore on next launch" icon="restore" selected disabled={busy} onclick={scheduleRestore} />
      </div>
    {:else}
      <div class="actions">
        <Pill label="Create backup" icon="save" selected disabled={busy} onclick={createBackup} />
        <Pill label="Choose backup to restore" icon="folder_open" disabled={busy} onclick={chooseBackup} />
      </div>
    {/if}
    <div class="close-row">
      {#if busy}<span role="status">Working…</span>{/if}
      <Pill label="Close" disabled={busy} onclick={close} />
    </div>
  </div>
</Modal>

<style>
  .backup-path { overflow-wrap: anywhere; font-family: var(--font-mono); }
  .backup-dialog { display: grid; gap: 0.9rem; }
  h2, h3, p, ul { margin: 0; }
  h2 { font: 600 1.45rem/1.15 var(--font-headline); }
  h3 { font: 700 0.77rem var(--font-label); }
  p, .close-row { font-size: var(--font-size-sm); color: var(--color-text-variant); }
  .preview { display: grid; gap: 0.6rem; padding: 0.8rem; border: 1px solid var(--color-outline-variant); border-radius: var(--radius-md); }
  .preview strong, .feedback { color: var(--color-text); }
  .failure { color: var(--color-error); overflow-wrap: anywhere; }
  .actions, .close-row { display: flex; align-items: center; flex-wrap: wrap; gap: 0.45rem; }
  .close-row { justify-content: flex-end; }
  ul { display: grid; gap: 0.55rem; padding: 0; list-style: none; }
  li { display: flex; align-items: center; gap: 0.35rem; }
  .paths { display: grid; flex: 1; min-width: 0; gap: 0.15rem; font: 500 0.7rem var(--font-mono); }
  .paths span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .replacement { color: var(--color-primary); }
</style>
