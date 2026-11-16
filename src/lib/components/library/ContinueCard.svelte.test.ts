// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import ContinueCard from "./ContinueCard.svelte";
import { audioStore } from "../../stores/audioStore";
import { getResumePoint, getSavedPosition } from "../../stores/positionStore";
import type { BookMeta, SavedPosition } from "../../types";

const base: BookMeta = {
  filePath: "test-book",
  title: "Sample",
  author: "Author",
  album: "",
  coverArt: null,
  duration: 120,
  chapters: [],
  tracks: [],
};
const saved: SavedPosition = { position: 3, duration: 60, trackIndex: 0, lastPlayed: "" };
const target = document.createElement("div");
let card: ReturnType<typeof mount> | undefined;

function render(book: BookMeta, position = saved) {
  document.body.appendChild(target);
  card = mount(ContinueCard, { target, props: { book, saved: position, onopen: vi.fn() } });
  flushSync();
}

function direction(label: string): HTMLButtonElement {
  return target.querySelector<HTMLButtonElement>(`button[aria-label="${label} chapter or track"]`)!;
}

afterEach(() => {
  if (card) void unmount(card);
  target.remove();
});

describe("Continue card chapter navigation", () => {
  it("changes the saved track without starting playback", async () => {
    const tracks = [0, 1].map((index) => ({
      title: `Track ${index}`, filePath: `track-${index}`, duration: 60, order: index,
    }));
    render({ ...base, tracks });
    expect(target.textContent).toContain("Track 1 of 2");
    expect(direction("Previous").disabled).toBe(true);

    direction("Next").click();
    await vi.waitFor(async () => {
      expect(await getSavedPosition(base.filePath)).toMatchObject({ trackIndex: 1, position: 0 });
    });
    expect(get(audioStore).currentBook).toBeNull();
  });

  it("resumes an explicitly selected chapter within the first ten seconds", async () => {
    const chapters = [{ title: "Intro", startTimeMs: 0 }, { title: "One", startTimeMs: 5000 }];
    const book = { ...base, filePath: "embedded-chapters", chapters };
    render(book);
    direction("Next").click();
    await vi.waitFor(async () => {
      expect(await getResumePoint(book.filePath)).toEqual({ position: 5, trackIndex: 0 });
    });
  });
});
