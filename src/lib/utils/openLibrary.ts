export interface CatalogBook {
  id: string;
  title: string;
  author: string;
  firstPublished: number | null;
}

const cache = new Map<string, CatalogBook[]>();
let lastRequest = -Infinity;

export async function searchOpenLibrary(query: string, signal: AbortSignal): Promise<CatalogBook[]> {
  const key = query.trim().replace(/\s+/g, " ");
  const cached = cache.get(key);
  if (cached) return cached;
  if (!key) return [];
  if (Date.now() - lastRequest < 1100) throw new Error("Wait a moment before searching again.");
  lastRequest = Date.now();

  const url = new URL("https://openlibrary.org/search.json");
  const isbn = key.replace(/[ -]/g, "");
  url.search = new URLSearchParams({
    q: /^(?:\d{9}[\dXx]|97[89]\d{10})$/.test(isbn) ? `isbn:${isbn}` : key,
    fields: "key,title,author_name,first_publish_year",
    limit: "8",
  }).toString();
  const response = await fetch(url, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
  });
  if (response.status === 429) throw new Error("Open Library is rate limiting searches. Try again later.");
  if (!response.ok) throw new Error("Open Library could not complete the search.");
  const { docs }: { docs?: unknown[] } = await response.json();
  const books = Array.isArray(docs) ? docs.flatMap((value): CatalogBook[] => {
    if (!value || typeof value !== "object") return [];
    const doc = value as Record<string, unknown>;
    if (typeof doc.key !== "string" || !/^\/works\/OL\d+W$/.test(doc.key) ||
        typeof doc.title !== "string" || !doc.title.trim()) return [];
    const author = Array.isArray(doc.author_name)
      ? doc.author_name.filter((item): item is string => typeof item === "string").join(", ")
      : "";
    const year = doc.first_publish_year;
    return [{
      id: doc.key,
      title: doc.title,
      author,
      firstPublished: typeof year === "number" && Number.isInteger(year) && year > 0 && year <= 3000 ? year : null,
    }];
  }) : [];
  if (cache.size >= 32) cache.delete(cache.keys().next().value!);
  cache.set(key, books);
  return books;
}
