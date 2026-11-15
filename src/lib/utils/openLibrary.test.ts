import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Open Library lookup", () => {
  it("searches by ISBN and keeps only supported work data", async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      docs: [
        { key: "/works/OL123W", title: "A Book", author_name: ["Author"], first_publish_year: 1937, cover_i: 123 },
        { key: "//example.org/work", title: "Unexpected URL" },
        { key: "/works/OL789W", title: "Another book", first_publish_year: "1938" },
      ],
    })));
    vi.stubGlobal("fetch", fetchMock);
    const { searchOpenLibrary } = await import("./openLibrary");
    const signal = new AbortController().signal;
    const result = await searchOpenLibrary("978-0-261-10221-7", signal);
    expect(result).toEqual([
      { id: "/works/OL123W", title: "A Book", author: "Author", firstPublished: 1937 },
      { id: "/works/OL789W", title: "Another book", author: "", firstPublished: null },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
      credentials: "omit", referrerPolicy: "no-referrer",
    }));
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin).toBe("https://openlibrary.org");
    expect(url.searchParams.get("q")).toBe("isbn:9780261102217");
    expect(await searchOpenLibrary("978-0-261-10221-7", signal)).toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives a readable error if it is rate limited", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 429 })));
    const { searchOpenLibrary } = await import("./openLibrary");
    await expect(searchOpenLibrary("Title", new AbortController().signal)).rejects.toThrow("rate limiting");
  });
});
