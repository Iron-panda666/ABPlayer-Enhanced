// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import BookEditDialog from "./BookEditDialog.svelte";
import * as userdata from "../stores/userdataStore";
import { libraryStore } from "../stores/libraryStore";
import { tierListsStore } from "../stores/tierListStore";
import { getStore } from "../stores/storeUtils";
import { resetStores } from "../../test/memoryStore";
import type { BookMeta } from "../types";

const book: BookMeta = { filePath: "demo/book.m4b", title: "Sample book", author: "Sample Author",
  album: "", duration: 43_325, coverArt: null, chapters: [], tracks: [] };
let target: HTMLDivElement;
let dialog: ReturnType<typeof mount>;
let onclose = vi.fn<() => void>();

function render(mode: "edit" | "create" = "edit", entry = book) {
  onclose = vi.fn<() => void>();
  target = document.createElement("div");
  document.body.appendChild(target);
  dialog = mount(BookEditDialog, { target, props: { mode, book: entry, collections: [], onclose } });
  flushSync();
}
function field(id: string) { return target.querySelector<HTMLInputElement>(`#edit-${id}`)!; }
function type(id: string, value: string) {
  const input = field(id);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
}
function click(label: string) {
  const button = [...target.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
  expect(button).toBeDefined();
  button!.click();
  flushSync();
}
function outside() { target.querySelector<HTMLElement>(".modal-overlay")!.click(); flushSync(); }

beforeEach(async () => {
  resetStores();
  await userdata.loadUserData();
  tierListsStore.set({ lists: [] });
  libraryStore.set({ books: [book], folders: [], scanning: false, enriching: false, positions: {} });
});
afterEach(async () => {
  if (dialog) await unmount(dialog);
  target?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("book editing regressions", () => {
  it("blocks outside clicks and Escape until changed fields are saved or explicitly discarded", () => {
    render();
    type("notes", "Keep this draft");
    outside();
    field("notes").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    flushSync();
    expect(onclose).not.toHaveBeenCalled();
    expect(field("notes").value).toBe("Keep this draft");
    expect(target.textContent).toContain("unsaved changes");
    click("Keep editing");
    expect(target.textContent).not.toContain("unsaved changes");
    outside();
    click("Discard changes");
    expect(onclose).toHaveBeenCalledTimes(1);
    expect(userdata.getUserBookData(book.filePath).notes).toBeNull();
  });

  it("can close an unchanged dialog without a discard warning", () => {
    render();
    outside();
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it("keeps invalid years in the draft and saves four-digit years with an editable catalog length", async () => {
    render();
    expect(field("publish-year").type).toBe("text");
    expect(field("length").disabled).toBe(false);
    expect(field("length").value).toBe("12:02:05");
    type("publish-year", "16");
    click("Save changes");
    expect(onclose).not.toHaveBeenCalled();
    expect(target.textContent).toContain("four-digit year");
    type("publish-year", "2016");
    type("audio-publish-year", "2018");
    type("year-read", "2026");
    type("length", "12,5");
    click("Save changes");
    await vi.waitFor(() => expect(onclose).toHaveBeenCalledTimes(1));
    await userdata.loadUserData();
    const stored = userdata.getUserBookData(book.filePath);
    expect(stored).toMatchObject({ publishYear: 2016, audioPublishYear: 2018, yearRead: 2026, durationOverride: 45_000 });
    expect(userdata.getDisplayDuration(book, stored)).toBe(45_000);
    expect(get(libraryStore).books[0].duration).toBe(43_325);
  });

  it("retains malformed times for correction rather than saving zero", () => {
    render();
    type("length", "12:75:00");
    click("Save changes");
    expect(onclose).not.toHaveBeenCalled();
    expect(target.textContent).toContain("Length: use H:MM:SS");
    expect(field("length").value).toBe("12:75:00");
  });

  it("persists length when logging a new book and when editing it again", async () => {
    render("create");
    type("title", "Logged example");
    type("length", "8:15:30");
    click("Save");
    await vi.waitFor(() => expect(onclose).toHaveBeenCalledTimes(1));
    const logged = get(libraryStore).books.find((b) => b.fileless)!;
    await userdata.loadUserData();
    expect(userdata.getDisplayDuration(logged, userdata.getUserBookData(logged.filePath))).toBe(29_730);
    await unmount(dialog);
    target.remove();
    render("edit", logged);
    expect(field("length").value).toBe("8:15:30");
    type("length", "9.5");
    click("Save changes");
    await vi.waitFor(() => expect(onclose).toHaveBeenCalledTimes(1));
    await userdata.loadUserData();
    expect(userdata.getDisplayDuration(logged, userdata.getUserBookData(logged.filePath))).toBe(34_200);
  });

  it("stages a selected cover until Save and discards it without changing saved metadata", async () => {
    vi.spyOn(userdata, "pickCoverArtData").mockResolvedValue("data:image/jpeg;base64,AQID");
    render();
    click("Add Cover");
    await vi.waitFor(() => expect(target.querySelector(".cover-preview img")).not.toBeNull());
    outside();
    expect(onclose).not.toHaveBeenCalled();
    expect(userdata.getUserBookData(book.filePath).coverArtOverride).toBeNull();
    click("Discard changes");
    expect(onclose).toHaveBeenCalledTimes(1);
    expect(userdata.getUserBookData(book.filePath).coverArtOverride).toBeNull();
  });

  it("keeps the dialog open when a disk write fails", async () => {
    const disk = await getStore("userdata.json");
    vi.spyOn(disk, "save").mockRejectedValueOnce(new Error("disk full"));
    render();
    type("notes", "Do not lose me");
    click("Save changes");
    await vi.waitFor(() => expect(target.textContent).toContain("Could not save the book"));
    expect(onclose).not.toHaveBeenCalled();
    expect(field("notes").value).toBe("Do not lose me");
  });

  it("imports the original book year without replacing the separate audio release year", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ docs: [
      { key: "/works/OL123W", title: "Sample book", author_name: ["Sample Author"], first_publish_year: 2011 },
    ] }))));
    render();
    expect(field("audio-publish-year").value).toBe("");
    type("audio-publish-year", "2018");
    target.querySelector<HTMLButtonElement>(".lookup-toggle")!.click();
    flushSync();
    target.querySelector(".lookup form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(target.querySelector(".result")).not.toBeNull());
    target.querySelector<HTMLButtonElement>(".result")!.click();
    flushSync();
    const yearChoice = [...target.querySelectorAll<HTMLInputElement>(".lookup input[type=checkbox]")]
      .find((input) => input.parentElement!.textContent!.includes("First publication year"))!;
    yearChoice.checked = true;
    yearChoice.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
    click("Use selected fields");
    expect(field("publish-year").value).toBe("2011");
    expect(field("audio-publish-year").value).toBe("2018");
    click("Save changes");
    await vi.waitFor(() => expect(onclose).toHaveBeenCalledTimes(1));
    expect(userdata.getUserBookData(book.filePath)).toMatchObject({ publishYear: 2011, audioPublishYear: 2018 });
  });
});
