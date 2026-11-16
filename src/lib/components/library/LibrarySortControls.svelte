<script lang="ts">
  import { tick } from "svelte";
  import type { SortBy, SortDirection } from "../../types";
  import { defaultSortDirection, LIBRARY_COLUMNS } from "../../utils/libraryColumns";
  import { IconButton, Panel, Pill } from "../ui";

  interface Props {
    listMode: boolean;
    sortBy: SortBy;
    sortDirection: SortDirection;
    columns: SortBy[];
    onsort: (column: SortBy, direction: SortDirection) => void;
    oncolumns: (columns: SortBy[]) => void;
  }

  let { listMode, sortBy, sortDirection, columns, onsort, oncolumns }: Props = $props();
  const allColumns = Object.keys(LIBRARY_COLUMNS) as SortBy[];
  let columnOptions = $derived([
    ...columns.filter((column) => column !== "title"),
    ...allColumns.filter((column) => !columns.includes(column)),
  ]);
  let menu = $state<"sort" | "columns" | null>(null);
  let root: HTMLDivElement;

  export async function openColumns() {
    menu = "columns";
    await tick();
    root.querySelector<HTMLInputElement>(".column-option input")?.focus({ preventScroll: true });
  }

  function toggleColumn(column: SortBy, checked: boolean) {
    oncolumns(checked ? [...columns, column] : columns.filter((item) => item !== column));
  }

  function moveColumn(index: number, offset: -1 | 1) {
    const next = [...columns];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    oncolumns(next);
  }
</script>

<div class="library-sort-controls" bind:this={root}>
  <div class="sort-anchor">
    <Pill icon={sortDirection === "asc" ? "arrow_upward" : "arrow_downward"}
      label={`Sort by ${LIBRARY_COLUMNS[sortBy].label}`} height="1.8rem" title="Sort books"
      ariaExpanded={menu === "sort"} onclick={() => (menu = menu === "sort" ? null : "sort")} />
    {#if menu === "sort"}
      <Panel label="Sort books" origin="top right" width="13rem" style="top: 2.1rem; right: 0;"
        onclose={() => (menu = null)}>
        <div class="sort-options">
          <fieldset>
            <legend>Sort by</legend>
            {#each allColumns as column (column)}
              <label class="sort-option">
                <input type="radio" name="book-sort" value={column} checked={column === sortBy}
                  onchange={() => onsort(column, defaultSortDirection(column))} />
                {LIBRARY_COLUMNS[column].label}
              </label>
            {/each}
          </fieldset>
          <fieldset>
            <legend>Direction</legend>
            <label class="sort-option">
              <input type="radio" name="book-sort-direction" checked={sortDirection === "asc"}
                onchange={() => onsort(sortBy, "asc")} />
              Ascending
            </label>
            <label class="sort-option">
              <input type="radio" name="book-sort-direction" checked={sortDirection === "desc"}
                onchange={() => onsort(sortBy, "desc")} />
              Descending
            </label>
          </fieldset>
        </div>
      </Panel>
    {/if}
  </div>

  {#if listMode}
    <div class="sort-anchor">
      <Pill icon="view_column" label="Columns" height="1.8rem" ariaExpanded={menu === "columns"}
        onclick={() => (menu = menu === "columns" ? null : "columns")} />
      {#if menu === "columns"}
        <Panel label="Library columns" origin="top right" width="15rem" style="top: 2.1rem; right: 0;"
          onclose={() => (menu = null)}>
          <div class="sort-options">
            <fieldset>
              <legend>Show and arrange columns</legend>
              {#each columnOptions as column (column)}
                {@const index = columns.indexOf(column)}
                {@const label = LIBRARY_COLUMNS[column].label}
                <div class="column-option">
                  <label class="sort-option">
                    <input type="checkbox" checked={index >= 0}
                      onchange={(e) => toggleColumn(column, e.currentTarget.checked)} />
                    {label}
                  </label>
                  {#if index > 0}
                    <IconButton icon="arrow_upward" size="1.45rem" label={`Move ${label} left`}
                      bare disabled={index <= 1} onclick={() => moveColumn(index, -1)} />
                    <IconButton icon="arrow_downward" size="1.45rem" label={`Move ${label} right`}
                      bare disabled={index === columns.length - 1} onclick={() => moveColumn(index, 1)} />
                  {/if}
                </div>
              {/each}
            </fieldset>
          </div>
        </Panel>
      {/if}
    </div>
  {/if}
</div>

<style>
  .library-sort-controls {
    display: flex;
    align-items: center;
    gap: 0.42rem;
    margin-left: auto;
  }

  .sort-anchor { position: relative; }
  .sort-options { max-height: min(65vh, 23rem); overflow-y: auto; }

  fieldset {
    margin: 0;
    padding: 0.25rem;
    border: 0;
    min-width: 0;
  }

  fieldset + fieldset { margin-top: 0.5rem; }

  legend {
    padding: 0.3rem 0.45rem;
    color: var(--color-text-variant);
    font: 600 0.7rem var(--font-label);
  }

  .sort-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 1.8rem;
    padding: 0 0.45rem;
    border-radius: var(--radius-sm);
    font: 600 0.76rem var(--font-label);
    cursor: pointer;
  }

  .sort-option:hover,
  .sort-option:focus-within { background: var(--color-surface-high); }
  .sort-option input { margin: 0; accent-color: var(--color-primary); }
  .column-option { display: flex; align-items: center; }
  .column-option .sort-option { flex: 1; }
</style>
