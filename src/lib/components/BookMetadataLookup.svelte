<script lang="ts">
  import { onDestroy } from "svelte";
  import { open } from "@tauri-apps/plugin-shell";
  import { searchOpenLibrary, type CatalogBook } from "../utils/openLibrary";

  let { queryForBook, authorForBook = () => "", onapply }: {
    queryForBook: () => string;
    authorForBook?: () => string;
    onapply: (fields: Partial<Pick<CatalogBook, "title" | "author" | "firstPublished">>) => void;
  } = $props();

  let expanded = $state(false);
  let query = $state("");
  let authorQuery = $state("");
  let status = $state<"idle" | "loading" | "done" | "error">("idle");
  let error = $state("");
  let results = $state<CatalogBook[]>([]);
  let chosen = $state<CatalogBook | null>(null);
  let useTitle = $state(true);
  let useAuthor = $state(true);
  let useYear = $state(false);
  let applied = $state(false);
  let request: AbortController | undefined;

  onDestroy(() => request?.abort());

  function toggle() {
    if (!expanded && !query && !authorQuery) {
      query = queryForBook();
      authorQuery = authorForBook();
    }
    expanded = !expanded;
  }

  async function search(event: SubmitEvent) {
    event.preventDefault();
    if (status === "loading" || (!query.trim() && !authorQuery.trim())) return;
    status = "loading";
    chosen = null;
    applied = false;
    const controller = new AbortController();
    request = controller;
    try {
      results = await searchOpenLibrary(query, controller.signal, authorQuery);
      status = "done";
    } catch (err) {
      if (controller.signal.aborted) return;
      error = err instanceof Error && err.name === "Error"
        ? err.message : "Open Library is unavailable. Try again later.";
      status = "error";
    } finally {
      request = undefined;
    }
  }

  function choose(book: CatalogBook) {
    chosen = book;
    useTitle = true;
    useAuthor = !!book.author;
    useYear = false;
    applied = false;
  }

  function apply() {
    if (!chosen) return;
    onapply({
      title: useTitle ? chosen.title : undefined,
      author: useAuthor ? chosen.author : undefined,
      firstPublished: useYear ? chosen.firstPublished : undefined,
    });
    applied = true;
  }
</script>

<div class="lookup">
  <button type="button" class="lookup-toggle" aria-expanded={expanded} onclick={toggle}>
    <span class="material-symbols-outlined" aria-hidden="true">travel_explore</span>
    Look up book metadata
    <span class="material-symbols-outlined" aria-hidden="true">{expanded ? "expand_less" : "expand_more"}</span>
  </button>
  {#if expanded}
    <div class="lookup-body">
      <form onsubmit={search}>
        <label for="catalog-query">Title or ISBN (optional)</label>
        <div class="query">
          <input bind:value={query} id="catalog-query" type="search" maxlength="220" placeholder="Book title or ISBN" />
          <button type="submit" disabled={(!query.trim() && !authorQuery.trim()) || status === "loading"}>Search</button>
        </div>
        <label for="catalog-author">Author (optional)</label>
        <div class="query"><input bind:value={authorQuery} id="catalog-author" type="search" maxlength="220" placeholder="Author name" /></div>
      </form>
      <p>ISBN is not required. Search by title and author, or just one of them. Search sends these fields to Open Library; imported metadata stays in the draft until you save the book.</p>
      <p>Results describe books and may refer to a print edition, not your audiobook. Check the narrator, release year and length against your audio edition.</p>
      {#if status === "loading"}
        <p role="status">Searching Open Library…</p>
      {:else if status === "error"}
        <p role="alert">{error}</p>
      {:else if status === "done" && results.length === 0}
        <p role="status">No matches. Try a shorter title, remove the author filter, or search by the author's name. An ISBN is not required.</p>
      {:else if status === "done"}
        <ul aria-label="Catalog matches">
          {#each results as result (result.id)}
            <li>
              <button type="button" class="result" aria-pressed={chosen?.id === result.id} onclick={() => choose(result)}>
                <strong>{result.title}</strong>
                <span>{[result.author, result.firstPublished].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          {/each}
        </ul>
        {#if chosen}
          <fieldset>
            <legend>Copy into the book form</legend>
            <label><input type="checkbox" bind:checked={useTitle} /> Title</label>
            <label><input type="checkbox" bind:checked={useAuthor} disabled={!chosen.author} /> Author</label>
            <label><input type="checkbox" bind:checked={useYear} disabled={!chosen.firstPublished} /> First publication year (book)</label>
          </fieldset>
          <div class="actions">
            <button type="button" onclick={apply} disabled={!useTitle && !useAuthor && !useYear}>Use selected fields</button>
            <button type="button" onclick={() => open(`https://openlibrary.org${chosen?.id}`)}>View source</button>
          </div>
          {#if applied}
            <p role="status">Fields added to the form. Review them, then save below.</p>
          {/if}
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .lookup { border: 1px solid var(--color-outline-variant); border-radius: var(--radius-md); margin-bottom: 1rem; }
  button, input { font: inherit; }
  button {
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text);
    padding: 0.4rem 0.6rem;
    cursor: pointer;
  }
  button:disabled { opacity: 0.5; cursor: default; }
  button:hover:enabled, .result[aria-pressed="true"] { background: var(--color-surface-highest); }
  .lookup-toggle { border: 0; width: 100%; display: flex; align-items: center; gap: 0.45rem; text-align: left; }
  .lookup-toggle span:last-child { margin-left: auto; }
  .lookup-body { padding: 0.55rem 0.65rem 0.7rem; border-top: 1px solid var(--color-outline-variant); font-size: 0.82rem; }
  label { display: flex; align-items: center; gap: 0.25rem; }
  p { margin: 0.43rem 0; color: var(--color-text-variant); }
  .query, .actions { display: flex; gap: 0.35rem; margin-top: 0.3rem; }
  .query input {
    min-width: 0; flex: 1; padding: 0.35rem;
    border: 1px solid var(--color-outline-variant); border-radius: var(--radius-sm);
    background: var(--color-surface); color: var(--color-text);
  }
  ul { list-style: none; margin: 0.4rem 0; padding: 0; max-height: 10rem; overflow: auto; }
  .result { width: 100%; text-align: left; display: grid; gap: 0.12rem; margin: 0.1rem 0; }
  .result span { color: var(--color-text-variant); }
  fieldset { display: flex; flex-wrap: wrap; gap: 0.3rem 0.8rem; border: 0; padding: 0; margin: 0.4rem 0; }
  legend { padding: 0; margin-bottom: 0.22rem; }
  input[type="checkbox"] { accent-color: var(--color-primary); }
</style>
