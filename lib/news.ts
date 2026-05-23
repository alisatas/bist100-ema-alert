// En çok okunan/dinlenen Türk finans haber kaynakları (RSS)
const RSS_FEEDS = [
  { url: "https://www.bloomberght.com/rss", name: "Bloomberg HT" },
  { url: "https://www.dunya.com/rss", name: "Dünya Gazetesi" },
  { url: "https://tr.investing.com/rss/news.rss", name: "Investing.com TR" },
  { url: "https://www.aa.com.tr/tr/rss/default?cat=ekonomi", name: "AA Ekonomi" },
  { url: "https://www.hurriyet.com.tr/rss/ekonomi", name: "Hürriyet Ekonomi" },
  { url: "https://www.sabah.com.tr/rss/ekonomi.xml", name: "Sabah Ekonomi" },
  { url: "https://www.milliyet.com.tr/rss/rssnew/ekonomirss.xml", name: "Milliyet Ekonomi" },
  { url: "https://www.haberturk.com/rss/ekonomi.xml", name: "Habertürk Ekonomi" },
  { url: "https://ekonomi.haber7.com/rss.asp", name: "Haber7 Ekonomi" },
  // Mynet 403 döndüğü için çıkarıldı
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; RSS reader)",
  "Accept": "application/rss+xml, application/xml, text/xml, */*",
};

export interface NewsItem {
  title: string;
  url: string;
  source: string;
}

function cleanText(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .trim();
}

function extractUrl(block: string): string {
  // Try <link> — RSS 2.0 (can be text node or href attr)
  const linkHref = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (linkHref) return linkHref[1];

  const linkText = block.match(/<link[^>]*>([^<]+)<\/link>/i);
  if (linkText) {
    const url = cleanText(linkText[1]).trim();
    if (url.startsWith("http")) return url;
  }

  // Atom <id> that looks like a URL
  const id = block.match(/<id[^>]*>(https?:\/\/[^<]+)<\/id>/i);
  if (id) return id[1].trim();

  return "";
}

function extractItems(xml: string, sourceName: string): NewsItem[] {
  const items: NewsItem[] = [];

  const itemRegex = /<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/gi;
  const blocks = xml.match(itemRegex) ?? [];

  const source = blocks.length > 0 ? blocks.slice(0, 12) : [xml];
  const titleRegex = /<title[^>]*>([\s\S]*?)<\/title>/gi;

  for (const block of source) {
    titleRegex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = titleRegex.exec(block)) !== null) {
      const title = cleanText(m[1]);
      if (title && title.length > 10 && !title.toLowerCase().includes("rss")) {
        const url = extractUrl(block);
        items.push({ title, url, source: sourceName });
        break;
      }
    }
  }
  return items;
}

export async function fetchNewsHeadlines(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async ({ url, name }) => {
      const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
      if (!res.ok) return [] as NewsItem[];
      const xml = await res.text();
      return extractItems(xml, name);
    })
  );

  const all: NewsItem[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }

  // Deduplicate by similar title (first 40 chars)
  const seen = new Set<string>();
  return all.filter((item) => {
    const key = item.title.slice(0, 40).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
