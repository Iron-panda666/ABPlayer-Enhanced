import type { BookMeta, BookStatus, SavedPosition, SortBy, SortDirection } from "../types";
import { progressPercent } from "./format";

export const LIBRARY_COLUMNS: Record<SortBy, { label: string; width: number }> = {
  title: { label: "Title", width: 11 },
  author: { label: "Author", width: 10 },
  duration: { label: "Duration", width: 6.6 },
  status: { label: "Status", width: 6.3 },
  progress: { label: "Progress", width: 5.8 },
  series: { label: "Series", width: 10 },
  narrator: { label: "Narrator", width: 10 },
  publishYear: { label: "Year", width: 4.2 },
  genre: { label: "Genre", width: 8 },
  recent: { label: "Last played", width: 8.4 },
};

export const DEFAULT_LIBRARY_COLUMNS: SortBy[] = ["title", "author", "duration"];
export const LIBRARY_ROW_ACTION_WIDTH = 8;

export function isLibraryColumn(value: unknown): value is SortBy {
  return typeof value === "string" && Object.hasOwn(LIBRARY_COLUMNS, value);
}

export function normalizeLibraryColumns(value: unknown): SortBy[] {
  if (!Array.isArray(value)) return [...DEFAULT_LIBRARY_COLUMNS];
  return [...new Set<SortBy>(["title", ...value.filter(isLibraryColumn)])];
}

export function defaultSortDirection(column: SortBy): SortDirection {
  return column === "recent" ? "desc" : "asc";
}

export type LibraryPosition = Pick<SavedPosition, "position" | "duration">
  & Partial<Pick<SavedPosition, "lastPlayed" | "trackIndex">>;

export function libraryProgress(book: BookMeta, status: BookStatus, position?: LibraryPosition): number {
  if (status === "finished") return 100;
  if (status === "not_started" || !position) return 0;

  let elapsed = position.position;
  let duration = position.duration;
  if (book.tracks.length > 1 && book.duration > 0) {
    const trackIndex = Math.min(book.tracks.length - 1, Math.max(0, position.trackIndex ?? 0));
    elapsed += book.tracks.slice(0, trackIndex).reduce((total, track) => total + track.duration, 0);
    duration = book.duration;
  }
  return Math.round(Math.max(0, progressPercent(elapsed, duration)));
}

export function lastPlayedTime(position?: LibraryPosition): number | null {
  const timestamp = Date.parse(position?.lastPlayed ?? "");
  return Number.isFinite(timestamp) ? timestamp : null;
}
