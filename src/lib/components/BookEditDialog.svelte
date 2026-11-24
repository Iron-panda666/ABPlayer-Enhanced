<script lang="ts">
  import { tick } from "svelte";
  import type { BookMeta, BookSource, BookStatus, Collection, UserBookData } from "../types";
  import {
    getUserBookData,
    setUserBookData,
    resetUserBookData,
    pickCoverArtData,
    getDisplayDuration,
  } from "../stores/userdataStore";
  import { addFilelessBook, clearProgress } from "../stores/libraryStore";
  import { formatBookLength, parseBookLength, parseBookYear } from "../utils/bookEdit";
  import { overrideCoverKey, saveCoverToDisk } from "../utils/coverStorage";
  import { audioStore } from "../stores/audioStore";
  import { get } from "svelte/store";
  import {
    tierListsStore,
    defaultTierList,
    assignBookToTier,
    unassignBook,
  } from "../stores/tierListStore";
  import Modal from "./Modal.svelte";
  import BookMetadataLookup from "./BookMetadataLookup.svelte";
  import { TierChip } from "./ui";

  type Mode = "edit" | "create";

  interface Props {
    mode?: Mode;
    /** Required in edit mode; ignored in create mode. */
    book?: BookMeta | null;
    collections: Collection[];
    existingSeriesNames?: string[];
    onclose: () => void;
    /** Fired after save. In create mode, passes the new book's filePath. */
    onsaved?: (filePath: string) => void;
  }

  let {
    mode = "edit",
    book = null,
    collections,
    existingSeriesNames = [],
    onclose,
    onsaved,
  }: Props = $props();

  // Dialog is mounted per-open from a parent `{#if}`, so one-shot seeding is correct —
  // `mode` and `book` never change within a single dialog instance.
  // svelte-ignore state_referenced_locally
  const seed: UserBookData =
    mode === "edit" && book
      ? getUserBookData(book.filePath)
      : {
          titleOverride: null,
          authorOverride: null,
          coverArtOverride: null,
          collections: [],
          status: "not_started",
          genre: null,
          series: null,
          seriesOrder: null,
          gainDb: null,
          dateAdded: new Date().toISOString(),
          dateFinished: null,
          narrator: null,
          description: null,
          notes: null,
          quotes: [],
          tags: [],
          yearRead: null,
          publishYear: null,
          source: null,
          axes: {},
          axisLabels: null,
        };

  // svelte-ignore state_referenced_locally
  let titleInput = $state(seed.titleOverride || "");
  let authorInput = $state(seed.authorOverride || "");
  let narratorInput = $state(seed.narrator || "");
  let genreInput = $state(seed.genre || "");
  let seriesInput = $state(seed.series || "");
  let seriesOrderInput = $state<number | "">(seed.seriesOrder ?? "");
  // svelte-ignore state_referenced_locally
  let lengthInput = $state(book ? formatBookLength(getDisplayDuration(book, seed)) : "");
  let yearReadInput = $state(seed.yearRead == null ? "" : String(seed.yearRead));
  let publishYearInput = $state(seed.publishYear == null ? "" : String(seed.publishYear));
  let audioPublishYearInput = $state(seed.audioPublishYear == null ? "" : String(seed.audioPublishYear));
  let sourceInput = $state<BookSource>(seed.source);
  let status = $state<BookStatus>(seed.status);
  let description = $state(seed.description || "");
  let notes = $state(seed.notes || "");
  let tagsList = $state<string[]>([...seed.tags]);
  let tagInput = $state("");
  let quotesList = $state<string[]>([...seed.quotes]);
  let quoteInput = $state("");
  let bookCollectionIds = $state<string[]>([...seed.collections]);

  // Covers, like text, remain a draft until Save in both modes.
  let createCover = $state<string | null>(null);
  let saving = $state(false);
  let pickingCover = $state(false);
  let closeBlocked = $state(false);
  let resetRequested = $state(false);
  let errorMessage = $state("");
  let errorNotice = $state<HTMLParagraphElement>();
  let closeNotice = $state<HTMLDivElement>();
  const currentYear = new Date().getFullYear();

  function draftSnapshot() {
    return JSON.stringify({ titleInput, authorInput, narratorInput, genreInput,
      seriesInput, seriesOrderInput, lengthInput, yearReadInput, publishYearInput, audioPublishYearInput,
      sourceInput, status, description, notes, tagsList, tagInput, quotesList, quoteInput,
      bookCollectionIds, createCover, tierChanges });
  }

  function requestClose() {
    if (saving || pickingCover) return;
    if (dirty) {
      closeBlocked = true;
      void tick().then(() => closeNotice?.scrollIntoView?.({ block: "nearest" }));
    }
    else onclose();
  }

  function showError(message: string) {
    errorMessage = message;
    void tick().then(() => errorNotice?.scrollIntoView?.({ block: "nearest" }));
  }

  const GENRE_SUGGESTIONS = [
    "Fiction", "Non-Fiction", "Sci-Fi", "Fantasy", "Mystery",
    "Romance", "Horror", "Biography", "Self-Help", "History",
    "Business", "Thriller", "Young Adult", "Literary Fiction",
  ];

  const SOURCES: { value: BookSource; label: string }[] = [
    { value: null, label: "— none —" },
    { value: "Audible", label: "Audible" },
    { value: "Library", label: "Library" },
    { value: "Physical", label: "Physical" },
    { value: "Other", label: "Other" },
  ];

  let coverPreview = $derived(
    createCover ?? seed.coverArtOverride ?? book?.coverArt ?? null,
  );

  const MAX_INPUT_LENGTH = 500;

  function sanitizeText(value: string, max: number = MAX_INPUT_LENGTH): string | null {
    const trimmed = value.trim().slice(0, max);
    return trimmed || null;
  }

  function parseInt1Plus(value: number | ""): number | null {
    if (value === "" || typeof value !== "number") return null;
    const n = Math.floor(value);
    if (!Number.isFinite(n) || n < 1) return null;
    return n;
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !tagsList.includes(t)) {
      tagsList = [...tagsList, t];
    }
    tagInput = "";
  }

  function removeTag(t: string) {
    tagsList = tagsList.filter((x) => x !== t);
  }

  function addQuote() {
    const q = quoteInput.trim();
    if (q) {
      quotesList = [...quotesList, q];
      quoteInput = "";
    }
  }

  function removeQuote(i: number) {
    quotesList = quotesList.filter((_, idx) => idx !== i);
  }

  // Tier: one choice per list, written on save. Only lists the user touched are changed.
  // svelte-ignore state_referenced_locally
  let tierListId = $state<string | null>(
    get(defaultTierList)?.id ?? get(tierListsStore).lists[0]?.id ?? null,
  );
  let tierChanges = $state<Record<string, string | null>>({});
  // Seeded once per mount; later store updates cannot erase a local draft.
  const originalDraft = draftSnapshot();
  let dirty = $derived(draftSnapshot() !== originalDraft);

  let tierListShown = $derived($tierListsStore.lists.find((l) => l.id === tierListId) ?? null);
  let tierOptions = $derived(
    (tierListShown?.tiers ?? []).slice().sort((a, b) => a.order - b.order),
  );
  let tierChosen = $derived.by(() => {
    if (!tierListShown) return null;
    if (tierListShown.id in tierChanges) return tierChanges[tierListShown.id];
    return book ? (tierListShown.assignments[book.filePath] ?? null) : null;
  });

  function chooseTier(tierId: string | null) {
    if (!tierListShown) return;
    tierChanges = { ...tierChanges, [tierListShown.id]: tierId };
  }

  async function saveTiers(filePath: string) {
    for (const [listId, tierId] of Object.entries(tierChanges)) {
      if (tierId) await assignBookToTier(listId, filePath, tierId);
      else await unassignBook(listId, filePath);
    }
  }

  function toggleCollection(id: string) {
    if (bookCollectionIds.includes(id)) {
      bookCollectionIds = bookCollectionIds.filter((c) => c !== id);
    } else {
      bookCollectionIds = [...bookCollectionIds, id];
    }
  }

  async function handleChangeCover() {
    if (saving || pickingCover) return;
    pickingCover = true;
    try {
      const data = await pickCoverArtData();
      if (data) createCover = data;
    } catch {
      showError("Could not load this cover. Your other changes are still here.");
    } finally {
      pickingCover = false;
    }
  }

  function buildUserDataPatch(): Partial<UserBookData> {
    return {
      titleOverride: sanitizeText(titleInput),
      authorOverride: sanitizeText(authorInput),
      narrator: sanitizeText(narratorInput),
      genre: sanitizeText(genreInput, 100),
      series: sanitizeText(seriesInput, 200),
      seriesOrder: seriesInput.trim() ? parseInt1Plus(seriesOrderInput) : null,
      yearRead: parseBookYear(yearReadInput),
      publishYear: parseBookYear(publishYearInput),
      audioPublishYear: parseBookYear(audioPublishYearInput),
      durationOverride: book && lengthInput === formatBookLength(book.duration) ? null : parseBookLength(lengthInput),
      source: sourceInput,
      description: sanitizeText(description, 4000),
      notes: sanitizeText(notes, 4000),
      tags: [...new Set([...tagsList, tagInput.trim()].filter(Boolean))],
      quotes: [...quotesList, quoteInput.trim()].filter(Boolean),
      collections: [...bookCollectionIds],
      status,
      dateFinished: status === "finished" ? (seed.dateFinished || new Date().toISOString()) : null,
    };
  }

  async function handleSave() {
    if (saving || pickingCover) return;
    errorMessage = "";
    for (const [label, value] of [["Year read", yearReadInput], ["Book publication year", publishYearInput], ["Audiobook release year", audioPublishYearInput]]) {
      if (value.trim() && parseBookYear(value) === null) {
        showError(`${label}: enter a four-digit year between 1000 and 3000, or leave it empty.`);
        return;
      }
    }
    if (lengthInput.trim() && parseBookLength(lengthInput) === null) {
      showError("Length: use H:MM:SS (12:30:00) or decimal hours (12.5 or 12,5). Maximum: 10,000 hours.");
      return;
    }
    saving = true;
    try {
    if (mode === "create") {
      if (!titleInput.trim()) return;
      const filePath = await addFilelessBook({
        title: titleInput.trim(),
        author: authorInput.trim() || "Unknown Author",
        coverArt: createCover,
        userData: {
          ...buildUserDataPatch(),
          // Catalog duration is persisted with the other metadata, including on creation.
        },
      });
      await saveTiers(filePath);
      onsaved?.(filePath);
      onclose();
      return;
    }

    if (!book) return;
    const patch = buildUserDataPatch();
    if (createCover) patch.coverArtOverride = await saveCoverToDisk(overrideCoverKey(book.filePath), createCover);
    await setUserBookData(book.filePath, patch);
    // Newly marked not started: forget where it was, so it reads as never
    // opened. The book in the player keeps its place; the player is holding it.
    if (
      status === "not_started" &&
      seed.status !== "not_started" &&
      get(audioStore).currentBook?.filePath !== book.filePath
    ) {
      await clearProgress([book.filePath]);
    }
    await saveTiers(book.filePath);
    onsaved?.(book.filePath);
    onclose();
    } catch {
      showError("Could not save the book. Your changes are still here; please try again.");
    } finally {
      saving = false;
    }
  }

  async function handleReset() {
    if (!book || mode === "create" || saving || pickingCover) return;
    if (!resetRequested) { resetRequested = true; return; }
    saving = true;
    try {
      await resetUserBookData(book.filePath);
      onclose();
    } catch {
      showError("Could not reset this book. Your changes are still here.");
    } finally { saving = false; }
  }

  const statuses: { value: BookStatus; label: string }[] = [
    { value: "not_started", label: "Not Started" },
    { value: "in_progress", label: "In Progress" },
    { value: "finished", label: "Finished" },
  ];
</script>

<Modal onclose={requestClose} label={mode === "create" ? "Log a book" : "Edit book"}>
  <h3>{mode === "create" ? "Log a book" : "Edit book"}</h3>
  {#if mode === "create"}
    <p class="subtitle">Log a book you've read — no audio file required.</p>
  {/if}

  {#if closeBlocked && dirty}
    <div class="edit-notice" role="alert" bind:this={closeNotice}>
      <p>You have unsaved changes. Save them below or explicitly discard them before closing.</p>
      <button class="btn-ghost btn-sm" onclick={() => (closeBlocked = false)} disabled={saving}>Keep editing</button>
      <button class="btn-ghost btn-sm" onclick={onclose} disabled={saving}>Discard changes</button>
    </div>
  {/if}
  {#if errorMessage}<p class="edit-error" role="alert" bind:this={errorNotice}>{errorMessage}</p>{/if}

  <fieldset class="edit-fields" disabled={saving || pickingCover}>

  <div class="cover-section">
    <div class="cover-preview">
      {#if coverPreview}
        <img src={coverPreview} alt="" />
      {:else}
        <span class="material-symbols-outlined cover-icon">auto_stories</span>
      {/if}
    </div>
    <button class="btn-ghost btn-sm" onclick={handleChangeCover}>
      {coverPreview ? "Change Cover" : "Add Cover"}
    </button>
  </div>

  <BookMetadataLookup
    queryForBook={() => (titleInput.trim() || book?.title || "").slice(0, 220)}
    authorForBook={() => authorInput.trim() || (book?.author === "Unknown Author" ? "" : book?.author) || ""}
    onapply={({ title, author, firstPublished }) => {
      if (title) titleInput = title;
      if (author) authorInput = author;
      if (firstPublished) publishYearInput = String(firstPublished);
    }}
  />

  <div class="field">
    <label class="label" for="edit-title">Title {#if mode === "create"}<span class="req">*</span>{/if}</label>
    <input
      id="edit-title"
      type="text"
      class="input"
      bind:value={titleInput}
      placeholder={book ? book.title : "Book title"}
      maxlength={MAX_INPUT_LENGTH}
    />
  </div>

  <div class="row">
    <div class="field flex">
      <label class="label" for="edit-author">Author</label>
      <input
        id="edit-author"
        type="text"
        class="input"
        bind:value={authorInput}
        placeholder={book ? book.author : "Author"}
        maxlength={MAX_INPUT_LENGTH}
      />
    </div>
    <div class="field flex">
      <label class="label" for="edit-narrator">Narrator</label>
      <input
        id="edit-narrator"
        type="text"
        class="input"
        bind:value={narratorInput}
        placeholder="Narrator"
        maxlength={MAX_INPUT_LENGTH}
      />
    </div>
  </div>

  <div class="row">
    <div class="field flex">
      <label class="label" for="edit-series">Series</label>
      <input
        id="edit-series"
        type="text"
        class="input"
        list="series-suggestions"
        bind:value={seriesInput}
        placeholder="Series name"
        maxlength={200}
      />
      <datalist id="series-suggestions">
        {#each existingSeriesNames as s}
          <option value={s}></option>
        {/each}
      </datalist>
    </div>
    <div class="field narrow">
      <label class="label" for="edit-series-order">Book #</label>
      <input
        id="edit-series-order"
        type="number"
        class="input"
        bind:value={seriesOrderInput}
        placeholder="#"
        min="1"
      />
    </div>
  </div>

  <div class="row">
    <div class="field flex">
      <label class="label" for="edit-genre">Genre</label>
      <input
        id="edit-genre"
        type="text"
        class="input"
        list="genre-suggestions"
        bind:value={genreInput}
        placeholder="e.g. Fantasy"
        maxlength={100}
      />
      <datalist id="genre-suggestions">
        {#each GENRE_SUGGESTIONS as g}
          <option value={g}></option>
        {/each}
      </datalist>
    </div>
    <div class="field flex">
      <label class="label" for="edit-length">Length (H:MM:SS or hours)</label>
      <input
        id="edit-length"
        type="text"
        class="input"
        bind:value={lengthInput}
        placeholder="12:30:00 or 12,5"
        maxlength={24}
        aria-describedby="length-help"
      />
      <p class="field-help" id="length-help">{book && !book.fileless
        ? `Audio length: ${formatBookLength(book.duration) || "unknown"}. This field changes the library display, not playback. Clear it to use the audio length.`
        : "For example, 12:30:00 or 12.5 / 12,5 hours."}</p>
    </div>
  </div>

  <div class="row">
    <div class="field flex">
      <label class="label" for="edit-year-read">Year read</label>
      <input
        id="edit-year-read"
        type="text"
        inputmode="numeric"
        class="input"
        bind:value={yearReadInput}
        placeholder={String(currentYear)}
        maxlength={4}
        pattern="[0-9]{4}"
      />
    </div>
    <div class="field flex">
      <label class="label" for="edit-publish-year">Book first published</label>
      <input
        id="edit-publish-year"
        type="text"
        inputmode="numeric"
        class="input"
        bind:value={publishYearInput}
        placeholder="2007"
        maxlength={4}
        pattern="[0-9]{4}"
      />
    </div>
  </div>

  <div class="row">
    <div class="field flex">
      <label class="label" for="edit-audio-publish-year">Audiobook released</label>
      <input id="edit-audio-publish-year" type="text" inputmode="numeric" class="input"
        bind:value={audioPublishYearInput} placeholder="2018" maxlength={4} pattern="[0-9]{4}"
        aria-describedby="audio-year-help" />
      <p class="field-help" id="audio-year-help">Release year of this audio edition, independent of the original book.</p>
    </div>
    <div class="field flex">
      <label class="label" for="edit-source">Source</label>
      <select id="edit-source" class="input" bind:value={sourceInput}>
        {#each SOURCES as src}
          <option value={src.value}>{src.label}</option>
        {/each}
      </select>
    </div>
  </div>

  <div class="field">
    <span class="label">Tags</span>
    <div class="chip-input">
      {#each tagsList as t}
        <span class="tag-chip">
          {t}
          <button class="chip-x" onclick={() => removeTag(t)} aria-label="Remove tag">×</button>
        </span>
      {/each}
      <input
        type="text"
        class="chip-input-field"
        bind:value={tagInput}
        placeholder="add tag + Enter"
        onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
        maxlength={60}
      />
    </div>
  </div>

  <div class="field">
    <label class="label" for="edit-description">Description</label>
    <textarea
      id="edit-description"
      class="input area"
      bind:value={description}
      placeholder="Back-of-book blurb"
      maxlength={4000}
    ></textarea>
  </div>

  <div class="field">
    <label class="label" for="edit-notes">Personal notes</label>
    <textarea
      id="edit-notes"
      class="input area"
      bind:value={notes}
      placeholder="Your review / thoughts"
      maxlength={4000}
    ></textarea>
  </div>

  <div class="field">
    <span class="label">Favorite quotes</span>
    <div class="quotes-list">
      {#each quotesList as q, i}
        <div class="quote-row">
          <div class="quote-text">"{q}"</div>
          <button class="chip-x" onclick={() => removeQuote(i)} aria-label="Remove quote">×</button>
        </div>
      {/each}
    </div>
    <div class="quote-add-row">
      <input
        type="text"
        class="input"
        bind:value={quoteInput}
        placeholder="Add a quote + Enter"
        onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); addQuote(); } }}
        maxlength={1000}
      />
      <button class="btn-ghost btn-sm" onclick={addQuote}>Add</button>
    </div>
  </div>

  <div class="field">
    <span class="label">Status</span>
    <div class="status-group">
      {#each statuses as s}
        <label class="radio-label">
          <input type="radio" name="status" value={s.value} bind:group={status} />
          <span class="radio-text">{s.label}</span>
        </label>
      {/each}
    </div>
  </div>

  {#if collections.length > 0}
    <div class="field">
      <span class="label">Collections</span>
      <div class="collection-picker">
        {#each collections as col (col.id)}
          <button
            class="collection-chip"
            class:selected={bookCollectionIds.includes(col.id)}
            onclick={() => toggleCollection(col.id)}
          >
            <span class="dot" style:background={col.color}></span>
            {col.name}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if tierListShown}
    <div class="field">
      <div class="tier-head">
        <span class="label">Tier</span>
        {#if $tierListsStore.lists.length > 1}
          <select class="input tier-list" aria-label="Tier list" bind:value={tierListId}>
            {#each $tierListsStore.lists as l (l.id)}
              <option value={l.id}>{l.name}</option>
            {/each}
          </select>
        {:else}
          <span class="tier-list-name">{tierListShown.name}</span>
        {/if}
      </div>
      <div class="collection-picker">
        {#each tierOptions as t (t.id)}
          <button
            class="collection-chip tier-pick"
            class:selected={tierChosen === t.id}
            aria-pressed={tierChosen === t.id}
            onclick={() => chooseTier(tierChosen === t.id ? null : t.id)}
          >
            <TierChip label={t.label} color={t.color} size="1.15rem" />
            {t.name || `Tier ${t.label}`}
          </button>
        {/each}
        <button
          class="collection-chip"
          class:selected={tierChosen === null}
          aria-pressed={tierChosen === null}
          onclick={() => chooseTier(null)}
        >
          Unranked
        </button>
      </div>
    </div>
  {/if}

  </fieldset>

  {#if resetRequested}
    <div class="edit-notice" role="alert">
      <p>Reset all saved metadata overrides for this book? This also discards the current draft.</p>
      <button class="btn-ghost btn-sm" onclick={() => (resetRequested = false)} disabled={saving}>Keep editing</button>
      <button class="btn-ghost btn-sm" onclick={handleReset} disabled={saving}>Confirm reset</button>
    </div>
  {/if}

  <div class="dialog-actions">
    {#if mode === "edit"}
      <button class="btn-ghost" onclick={() => (resetRequested = true)} disabled={saving || pickingCover}>Reset to original</button>
    {/if}
    <button class="btn-ghost" onclick={requestClose} disabled={saving || pickingCover}>Cancel</button>
    <button class="btn-primary" onclick={handleSave} disabled={saving || pickingCover || (mode === "create" && !titleInput.trim())}>
      {saving ? "Saving…" : mode === "create" ? "Save" : "Save changes"}
    </button>
  </div>
</Modal>

<style>
  .edit-fields { border: 0; padding: 0; margin: 0; min-width: 0; }
  .edit-notice { position: sticky; top: 0; z-index: 2; padding: 0.7rem; margin: 0.5rem 0; border: 1px solid var(--color-primary); border-radius: var(--radius-md); background: var(--color-surface); }
  .edit-notice p, .edit-error { margin: 0 0 0.5rem; font-size: var(--font-size-sm); }
  .edit-error { color: var(--color-primary); }
  .field-help { font-size: var(--font-size-xs); color: var(--color-text-variant); margin-top: 0.35rem; }
  h3 {
    font-family: var(--font-headline);
    font-size: var(--font-size-lg);
    font-weight: 500;
    margin-bottom: 0.25rem;
  }

  .subtitle {
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
    margin-bottom: var(--spacing-md);
  }

  .cover-section {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-md);
  }

  .cover-preview {
    width: 4.5rem;
    height: 4.5rem;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--color-surface-high);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .cover-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover-icon {
    font-size: 2rem;
    color: var(--color-outline-variant);
  }

  .field { margin-bottom: var(--spacing-md); }
  .field.flex { flex: 1; min-width: 0; }
  .field.narrow { width: 5rem; flex-shrink: 0; }

  .row {
    display: flex;
    gap: var(--spacing-sm);
    margin-bottom: 0;
  }

  .row > .field { margin-bottom: var(--spacing-md); }

  .label {
    display: block;
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-variant);
    margin-bottom: 4px;
  }

  .req { color: var(--color-primary); margin-left: 0.25rem; }

  .input {
    width: 100%;
    padding: 0.45rem 0.6rem;
    border: none;
    background: var(--color-surface-high);
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: var(--font-size-md);
    color: var(--color-text);
    outline: none;
    transition: box-shadow 0.15s;
  }

  .input:focus {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 25%, transparent);
  }

  .input::placeholder { color: var(--color-outline); }

  .input:disabled { opacity: 0.5; cursor: not-allowed; }

  .input.area {
    min-height: 3.5rem;
    resize: vertical;
    font-family: var(--font-body);
    line-height: 1.45;
  }

  select.input {
    appearance: none;
    padding-right: 1.5rem;
    background-image: linear-gradient(45deg, transparent 50%, var(--color-text-variant) 50%), linear-gradient(135deg, var(--color-text-variant) 50%, transparent 50%);
    background-position: calc(100% - 0.8rem) center, calc(100% - 0.55rem) center;
    background-size: 0.3rem 0.3rem, 0.3rem 0.3rem;
    background-repeat: no-repeat;
  }

  .status-group { display: flex; gap: var(--spacing-md); }

  .radio-label {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }

  .radio-label input[type="radio"] { accent-color: var(--color-primary); }

  .radio-text {
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    color: var(--color-text);
  }

  .chip-input {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    align-items: center;
    background: var(--color-surface-high);
    border-radius: var(--radius-md);
    padding: 0.4rem;
    min-height: 2.2rem;
  }

  .tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0.2rem 0.5rem;
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
    color: var(--color-primary);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    font-weight: 500;
  }

  .chip-input-field {
    flex: 1;
    min-width: 6rem;
    background: transparent;
    border: none;
    outline: none;
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
  }

  .chip-x {
    background: none;
    border: none;
    color: currentColor;
    opacity: 0.6;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0 2px;
  }

  .chip-x:hover { opacity: 1; }

  .quotes-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-bottom: 0.4rem;
  }

  .quote-row {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    padding: 0.4rem 0.6rem;
    background: var(--color-surface-high);
    border-left: 2px solid var(--color-primary);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
  }

  .quote-text {
    flex: 1;
    font-family: var(--font-headline);
    font-style: italic;
    font-size: var(--font-size-sm);
    line-height: 1.4;
    color: var(--color-text);
  }

  .quote-add-row {
    display: flex;
    gap: 0.4rem;
  }

  .quote-add-row .input { flex: 1; }

  .collection-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .collection-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text-variant);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    padding: 4px 10px;
    border-radius: var(--radius-xl);
    cursor: pointer;
    transition: background 0.15s;
  }

  .collection-chip:hover { background: var(--color-surface-highest); }

  .collection-chip.selected {
    background: var(--color-primary-container);
    color: var(--color-on-primary);
  }

  .tier-head {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    margin-bottom: 0.3rem;
  }

  .tier-head .label {
    margin: 0;
  }

  .tier-list {
    width: auto;
    max-width: 14rem;
    padding-top: 0.2rem;
    padding-bottom: 0.2rem;
  }

  .tier-list-name {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
  }

  .tier-pick {
    padding-left: 0.3rem;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dialog-actions {
    display: flex;
    justify-content: space-between;
    margin-top: var(--spacing-lg);
    gap: var(--spacing-sm);
  }

  .btn-primary {
    background: var(--color-ink);
    color: var(--color-on-ink);
    border: none;
    padding: 0.5rem 1.2rem;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary:hover:not(:disabled) { opacity: 0.9; }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn-ghost {
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text-variant);
    padding: 0.5rem 1rem;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .btn-ghost:hover { background: var(--color-surface-highest); }

  .btn-sm {
    padding: 0.3rem 0.75rem;
    font-size: var(--font-size-xs);
  }
</style>
