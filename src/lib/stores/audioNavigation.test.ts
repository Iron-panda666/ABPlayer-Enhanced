import { describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { audioStore, chapterNavigation } from "./audioStore";

describe("chapter transport", () => {
  const state = get(audioStore);
  const chapters = [
    { title: "One", startTimeMs: 0 },
    { title: "Two", startTimeMs: 60000 },
  ];

  it("uses the chapter index for embedded chapters", () => {
    expect(chapterNavigation({ ...state, chapters, currentChapterIndex: 1 }))
      .toEqual({ index: 1, previous: true, next: false });
  });

  it("uses the track index even when chapter metadata differs", () => {
    expect(chapterNavigation({ ...state, chapters, totalTracks: 3, currentTrackIndex: 1 }))
      .toEqual({ index: 1, previous: true, next: true });
    expect(chapterNavigation({ ...state, chapters, totalTracks: 3, currentTrackIndex: 0 }))
      .toEqual({ index: 0, previous: false, next: true });
  });

  it("disables both directions for audio without chapters", () => {
    expect(chapterNavigation({ ...state, totalTracks: 1 }))
      .toEqual({ index: -1, previous: false, next: false });
  });
});
