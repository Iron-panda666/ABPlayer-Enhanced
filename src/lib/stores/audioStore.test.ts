import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import type { BookMeta } from "../types";
import {
  audioStore, beginSeekGesture, getAudioElement, jumpToBookmark, loadBook, seek, stepChapter, togglePlay, undoSeek,
} from "./audioStore";
import { removePosition, stopAutoSave } from "./positionStore";

const book: BookMeta = {
  filePath: "C:/Audiobooks/sample",
  title: "Sample",
  author: "Author",
  album: "",
  duration: 360,
  coverArt: null,
  chapters: [],
  tracks: Array.from({ length: 2 }, (_, order) => ({
    filePath: `C:/Audiobooks/sample/${order}.mp3`, title: `Track ${order}`, duration: 180, order,
  })),
};

class TestAudio extends EventTarget {
  static plays = 0;
  src = "";
  duration = 180;
  currentTime = 0;
  paused = true;

  play() {
    TestAudio.plays++;
    this.paused = false;
    this.dispatchEvent(new Event("play"));
    this.dispatchEvent(new Event("playing"));
    return Promise.resolve();
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
}

class TestAudioContext {
  state = "running";
  private node() {
    return { connect() {}, frequency: { value: 0 }, Q: { value: 0 }, gain: { value: 0 } };
  }
  createMediaElementSource() { return this.node(); }
  createBiquadFilter() { return this.node(); }
  createGain() { return this.node(); }
}

beforeEach(async () => {
  vi.stubGlobal("Audio", TestAudio);
  vi.stubGlobal("AudioContext", TestAudioContext);
  await removePosition(book.filePath);
  const plays = TestAudio.plays;
  await loadBook(book);
  await vi.waitFor(() => expect(TestAudio.plays).toBeGreaterThan(plays));
});

afterEach(() => {
  stopAutoSave();
  vi.unstubAllGlobals();
});

describe("undo seek", () => {
  it("returns to the former track and time without resuming paused playback", () => {
    const audio = getAudioElement();
    audio.currentTime = 42.5;
    stepChapter(1);
    expect(get(audioStore).currentTrackIndex).toBe(1);
    togglePlay();

    expect(undoSeek()).toBe(true);
    expect(audio.paused).toBe(true);
    expect(get(audioStore)).toMatchObject({ currentTrackIndex: 0, currentTime: 42.5, seekUndo: null });
    expect(undoSeek()).toBe(false);
  });

  it("uses the pre-drag position for all updates in a gesture", () => {
    const audio = getAudioElement();
    audio.currentTime = 18;
    const scrub = beginSeekGesture();
    scrub(55);
    scrub(75);
    scrub(120);
    seek(Number.NaN);
    expect(audio.currentTime).toBe(120);
    expect(undoSeek()).toBe(true);
    expect(audio.currentTime).toBe(18);
  });

  it("remembers a bookmark jump and clears the undo point on a different book", async () => {
    getAudioElement().currentTime = 15;
    jumpToBookmark(60, 1);
    expect(undoSeek()).toBe(true);
    expect(get(audioStore)).toMatchObject({ currentTrackIndex: 0, currentTime: 15 });

    seek(99);
    await loadBook({ ...book, filePath: "C:/Audiobooks/another" });
    expect(undoSeek()).toBe(false);
  });
});
