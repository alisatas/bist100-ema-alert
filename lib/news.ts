const RSS_FEEDS = [
  { url: "https://www.bloomberght.com/rss", name: "Bloomberg HT" },
  { url: "https://www.dunya.com/rss", name: "Dünya Gazetesi" },
  { url: "https://tr.investing.com/rss/news.rss", name: "Investing.com TR" },
  { url: "https://finans.mynet.com/rss/", name: "Mynet Finans" },
  { url: "https://www.aa.com.tr/tr/rss/default?cat=ekonomi", name: "AA Ekonomi" },
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; RSS reader)",
  "Accept": "application/rss+xml, application/xml, text/xml, */*",
};

function extractTitles(xml: string, sourceName: string): string[] {
  const titles: string[] = [];
  // Match both <title> inside <item> and <entry> (RSS 2.0 + Atom)
  const itemRegex = /<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/gi;
  const titleRegex = /<title[^>]*>(?:<!\[CDATA\[)?\s*([\s\S]*?)\s*(?:\]\]>)?<\/title>/i;

  const items = xml.match(itemRegex) ?? [];
  for (const item of items.slice(0, 12)) {
    const m = item.match(titleRegex);
    if (m?.[1]) {
      const title = m[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
      if (title && title.length > 10) {
        titles.push(`[${sourceName}] ${title}`);
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
