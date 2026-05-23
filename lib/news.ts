const RSS_FEEDS = [
  { url: "https://www.bloomberght.com/rss", name: "Bloomberg HT" },
  { url: "https://www.dunya.com/rss", name: "Dünya Gazetesi" },
  { url: "https://tr.investing.com/rss/news.rss", name: "Investing.com TR" },
  { url: "https://www.aa.com.tr/tr/rss/default?cat=ekonomi", name: "AA Ekonomi" },
  // Mynet 403 döndüğü için çıkarıldı
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; RSS reader)",
  "Accept": "application/rss+xml, application/xml, text/xml, */*",
};

function cleanTitle(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .trim();
}

function extractTitles(xml: string, sourceName: string): string[] {
  const titles: string[] = [];

  // Try <item> blocks first (RSS 2.0), then <entry> (Atom)
  const itemRegex = /<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/gi;
  const items = xml.match(itemRegex) ?? [];

  // Fallback: extract all <title> tags if no items found
  const source = items.length > 0 ? items.slice(0, 12) : [xml];
  const titleRegex = /<title[^>]*>([\s\S]*?)<\/title>/gi;

  for (const block of source) {
    // Reset lastIndex for global regex
    titleRegex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = titleRegex.exec(block)) !== null) {
      const title = cleanTitle(m[1]);
      if (title && title.length > 10 && !title.toLowerCase().includes("rss")) {
        titles.push(`[${sourceName}] ${title}`);
        break; // one title per item
      }
    }
  }
  return titles;
}

export async function fetchNewsHeadlines(): Promise<string[]> {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async ({ url, name }) => {
      const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
      if (!res.ok) return [];
      const xml = await res.text();
      return extractTitles(xml, name);
    })
  );

  const all: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }

  // Deduplicate by similar title (first 40 chars)
  const seen = new Set<string>();
  return all.filter((t) => {
    const key = t.slice(0, 40).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
