<script lang="ts">
  import { bookDragSource } from "../utils/pointerDrag";
  import { Cover } from "./ui";
  import type { BookMeta, BookStatus, UserBookData, Collection, SortBy } from "../types";
  import { formatTime } from "../utils/format";
  import { DEFAULT_LIBRARY_COLUMNS, lastPlayedTime, libraryProgress, type LibraryPosition } from "../utils/libraryColumns";
  import { getDisplayTitle, getDisplayAuthor, getDisplayCover, getDisplayDuration } from "../stores/userdataStore";
  import StatusBadge from "./StatusBadge.svelte";
  import CollectionTag from "./CollectionTag.svelte";
  import BookMenu from "./library/BookMenu.svelte";

  interface Props {
    book: BookMeta;
    userData?: UserBookData | undefined;
    collections: Collection[];
    columns?: SortBy[];
    position?: LibraryPosition | undefined;
    selectionMode?: boolean;
    selected?: boolean;
    onedit: (book: BookMeta) => void;
    onplay: (book: BookMeta) => void;
    /** The book's page: files, notes, details. */
    ondetails?: (book: BookMeta) => void;
    onstatus?: (book: BookMeta, status: BookStatus) => void;
    onremove?: (book: BookMeta) => void;
    /** Offered on multi-file books: back to one entry per file. */
    onsplit?: (book: BookMeta) => void;
    /** `range` is true for a shift-click: select everything since the last pick. */
    ontoggleselect?: (book: BookMeta, range: boolean) => void;
  }

  let {
    book, userData, collections, columns = DEFAULT_LIBRARY_COLUMNS, position,
    selectionMode = false, selected = false, onedit, onplay, ondetails, onstatus, onremove, onsplit, ontoggleselect,
  }: Props = $props();

  let title = $derived(getDisplayTitle(book, userData));
  let author = $derived(getDisplayAuthor(book, userData));
  let cover = $derived(getDisplayCover(book, userData));
  let duration = $derived(getDisplayDuration(book, userData));
  let status = $derived(userData?.status || "not_started");
  let progress = $derived(libraryProgress(book, status, position));
  let bookCollections = $derived(
    (userData?.collections || [])
      .map((id) => collections.find((c) => c.id === id))
      .filter(Boolean) as Collection[],
  );
  let seriesLabel = $derived(
    userData?.series
      ? userData.seriesOrder
        ? `${userData.series} #${userData.seriesOrder}`
        : userData.series
      : null,
  );

  let contextMenu = $state<{ x: number; y: number } | null>(null);
  const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

  function columnText(column: SortBy): string | null {
    switch (column) {
      case "author": return author;
      case "duration": return duration > 0 ? formatTime(duration) : null;
      case "progress": return `${progress}%`;
      case "series": return seriesLabel;
      case "narrator": return userData?.narrator || null;
      case "publishYear": return userData?.publishYear == null ? null : String(userData.publishYear);
      case "audioPublishYear": return userData?.audioPublishYear == null ? null : String(userData.audioPublishYear);
      case "genre": return userData?.genre || null;
      case "recent": {
        const timestamp = lastPlayedTime(position);
        return timestamp === null ? null : dateFormatter.format(timestamp);
      }
      default: return null;
    }
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    contextMenu = { x: e.clientX, y: e.clientY };
  }
</script>

<tr
  class="list-item"
  class:selected
  oncontextmenu={handleContextMenu}
>
  <td>
    <button
      class="list-item-main"
      data-press="none"
      use:bookDragSource={{ payload: { filePath: book.filePath } }}
      aria-label={selectionMode ? `Select ${title}` : `Play ${title}`}
      aria-pressed={selectionMode ? selected : undefined}
      onclick={(e) => {
        if (selectionMode) ontoggleselect?.(book, e.shiftKey);
        else if (e.detail === 0) onplay(book);
      }}
      ondblclick={() => !selectionMode && onplay(book)}
    >
      {#if selectionMode}
        <span class="select-check" class:on={selected}>
          <span class="material-symbols-outlined" aria-hidden="true">
            {selected ? "check_circle" : "radio_button_unchecked"}
          </span>
        </span>
      {/if}
      <span class="cover-slot">
        <Cover src={cover} alt="" size="3.2rem" natural logged={book.fileless === true} />
      </span>
      <span class="info">
        <span class="title" title={title}>{title}</span>
        <span class="info-bottom">
          {#if progress > 0 && !columns.includes("progress")}
            <span class="progress-track">
              <span class="progress-fill" style:width="{progress}%"></span>
            </span>
            <span class="progress-text">{progress}%</span>
          {/if}
          {#if !columns.includes("status")}
            <StatusBadge {status} />
          {/if}
          {#if seriesLabel && !columns.includes("series")}
            <span class="series-badge">{seriesLabel}</span>
          {/if}
          {#each bookCollections as col (col.id)}
            <CollectionTag name={col.name} color={col.color} />
          {/each}
        </span>
      </span>
    </button>
  </td>
  {#each columns.slice(1) as column (column)}
    {@const value = columnText(column)}
    <td class="data-cell">
      {#if column === "status" && status !== "not_started"}
        <StatusBadge {status} />
      {:else if column === "status"}
        <span class="cell-text">New</span>
      {:else}
        <span class="cell-text" class:missing={value === null} title={value ?? undefined}>{value ?? "—"}</span>
      {/if}
    </td>
  {/each}
  <td>
    <div class="row-actions">
      {#if ondetails}
        <button class="row-btn" onclick={() => ondetails(book)} title="View book" aria-label="View book">
          <span class="material-symbols-outlined" aria-hidden="true">info</span>
        </button>
      {/if}
      <button class="row-btn" onclick={() => onedit(book)} title="Edit" aria-label="Edit">
        <span class="material-symbols-outlined" aria-hidden="true">edit</span>
      </button>
      {#if onsplit && book.tracks.length > 1}
        <button class="row-btn" onclick={() => onsplit(book)} title="Split into files" aria-label="Split into files">
          <span class="material-symbols-outlined" aria-hidden="true">call_split</span>
        </button>
      {/if}
      {#if onremove}
        <button class="row-btn danger" onclick={() => onremove(book)} title="Remove" aria-label="Remove">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      {/if}
    </div>
    {#if contextMenu}
      <BookMenu
        {book}
        {userData}
        {collections}
        x={contextMenu.x}
        y={contextMenu.y}
        onclose={() => (contextMenu = null)}
        onplay={() => onplay(book)}
        ondetails={ondetails ? () => ondetails(book) : undefined}
        onedit={() => onedit(book)}
        onstatus={onstatus ? (s) => onstatus(book, s) : undefined}
        onsplit={onsplit ? () => onsplit(book) : undefined}
        onremove={onremove ? () => onremove(book) : undefined}
      />
    {/if}
  </td>
</tr>

<style>
  .list-item {
    position: relative;
    transition: background 0.15s;
  }

  td { padding: 0; }
  td:first-child { border-radius: var(--radius-md) 0 0 var(--radius-md); }
  td:last-child { border-radius: 0 var(--radius-md) var(--radius-md) 0; }

  .list-item:hover {
    background: var(--color-surface);
  }

  .list-item.selected {
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  }

  .list-item-main {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.35rem 0.7rem;
    background: none;
    border: none;
    color: var(--color-text);
    font: inherit;
    cursor: pointer;
    text-align: left;
    min-width: 0;
  }

  /* Keep the whole row clickable while exposing separate table cells. */
  .list-item-main::after {
    content: "";
    position: absolute;
    inset: 0;
  }

  /* The circle is part of the row button, so the whole row selects, circle included */
  .select-check {
    flex-shrink: 0;
    display: flex;
    color: var(--color-outline);
  }

  .select-check.on {
    color: var(--color-primary);
  }

  .select-check .material-symbols-outlined {
    font-size: 1.5rem;
  }

  .select-check.on .material-symbols-outlined {
    font-variation-settings: "FILL" 1;
  }

  /* Fixed slot so titles line up whatever shape each cover is */
  .cover-slot {
    flex-shrink: 0;
    width: 3.2rem;
    height: 3.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .title {
    font-family: var(--font-headline);
    font-size: var(--font-size-md);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
  }

  .data-cell {
    padding-inline: 0.55rem;
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
    font-variant-numeric: tabular-nums;
  }

  .cell-text {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .missing { color: var(--color-outline); }

  .info-bottom {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
  }

  .progress-track {
    width: 5rem;
    height: 3px;
    background: var(--color-surface-highest);
    flex-shrink: 0;
  }

  .progress-fill {
    display: block;
    height: 100%;
    background: var(--color-primary-container);
  }

  .progress-text {
    font-family: var(--font-label);
    font-size: 0.6rem;
    color: var(--color-outline);
    font-variant-numeric: tabular-nums;
  }

  .series-badge {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--color-primary);
    white-space: nowrap;
  }

  .row-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 0.15rem;
  }

  .row-btn {
    position: relative;
    background: none;
    border: none;
    color: var(--color-outline);
    cursor: pointer;
    padding: 0.4rem;
    border-radius: var(--radius-md);
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .list-item:hover .row-btn,
  .list-item:focus-within .row-btn {
    opacity: 1;
  }

  .row-btn:hover {
    color: var(--color-text);
  }

  .row-btn.danger:hover {
    color: var(--color-error);
  }

  .row-btn .material-symbols-outlined {
    font-size: 1.15rem;
  }
</style>
