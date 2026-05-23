const BASE = "https://query2.finance.yahoo.com/v8/finance/chart";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json",
  "Origin": "https://finance.yahoo.com",
  "Referer": "https://finance.yahoo.com/",
};

interface MacroQuote {
  label: string;
  symbol: string;
  price: number;
  prevClose: number;
  pct: number;
  unit: string;
  group: string;
}

const INSTRUMENTS = [
  // Kur
  { symbol: "USDTRY=X", label: "USD/TRY", unit: "₺", group: "kur" },
  { symbol: "EURTRY=X", label: "EUR/TRY", unit: "₺", group: "kur" },
  // Emtia
  { symbol: "GC=F",  label: "Altın",       unit: "$", group: "emtia" },
  { symbol: "SI=F",  label: "Gümüş",       unit: "$", group: "emtia" },
  { symbol: "BZ=F",  label: "Brent Petrol", unit: "$", group: "emtia" },
  { symbol: "NG=F",  label: "Doğalgaz",    unit: "$", group: "emtia" },
  // Kripto
  { symbol: "BTC-USD", label: "Bitcoin",  unit: "$", group: "kripto" },
  { symbol: "ETH-USD", label: "Ethereum", unit: "$", group: "kripto" },
  // Endeksler
  { symbol: "XU100.IS", label: "BIST 100",    unit: "",  group: "endeks" },
  { symbol: "ES=F",     label: "S&P 500 Vad.", unit: "",  group: "endeks" },
  { symbol: "^VIX",     label: "VIX",          unit: "",  group: "endeks" },
  { symbol: "^GDAXI",   label: "DAX",          unit: "",  group: "endeks" },
] as const;

async function fetchQuote(symbol: string): Promise<{ price: number; prevClose: number } | null> {
  try {
    const url = `${BASE}/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { ...HEADERS, Referer: `https://finance.yahoo.com/quote/${symbol}/` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    return {
      price: meta.regularMarketPrice,
      prevClose: meta.chartPreviousClose ?? meta.regularMarketPrice,
    };
  } catch {
    return null;
  }
}

function arrow(pct: number): string {
  if (pct >= 1) return "🟢";
  if (pct > 0) return "🔼";
  if (pct <= -1) return "🔴";
  return "🔽";
}

function fmt(price: number, unit: string, group: string): string {
  if (group === "kripto") {
    return `${unit}${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (price >= 10000) return `${unit}${price.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
  if (price >= 100)   return `${unit}${price.toFixed(2)}`;
  return `${unit}${price.toFixed(4)}`;
}

function pctStr(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

export async function buildMacroBrief(date: string): Promise<string> {
  const quotes = await Promise.all(
    INSTRUMENTS.map(async ({ symbol, label, unit, group }) => {
      const q = await fetchQuote(symbol);
      if (!q) return null;
      const pct = ((q.price - q.prevClose) / q.prevClose) * 100;
      return { label, symbol, price: q.price, prevClose: q.prevClose, pct, unit, group } as MacroQuote;
    })
  );

  const byGroup = (g: string) => quotes.filter((q): q is MacroQuote => q?.group === g);

  const lines: string[] = [`🌅 <b>Sabah Brifing</b> — ${date}`, ""];

  const sections: Array<{ title: string; group: string; isIndex?: boolean }> = [
    { title: "💱 Kurlar",    group: "kur" },
    { title: "🪙 Emtia",     group: "emtia" },
    { title: "₿ Kripto",     group: "kripto" },
    { title: "📈 Endeksler", group: "endeks", isIndex: true },
  ];

  for (const { title, group, isIndex } of sections) {
    lines.push(`<b>${title}</b>`);
    for (const q of byGroup(group)) {
      if (isIndex && !q.unit) {
        const priceStr = q.price.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
        lines.push(`${arrow(q.pct)} ${q.label}: ${priceStr} (${pctStr(q.pct)})`);
      } else {
        lines.push(`${arrow(q.pct)} ${q.label}: ${fmt(q.price, q.unit, group)} (${pctStr(q.pct)})`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
