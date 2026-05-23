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
}

const INSTRUMENTS = [
  // Kur
  { symbol: "USDTRY=X", label: "USD/TRY", unit: "₺" },
  { symbol: "EURTRY=X", label: "EUR/TRY", unit: "₺" },
  // Emtia
  { symbol: "GC=F", label: "Altın", unit: "$" },
  { symbol: "BZ=F", label: "Brent Petrol", unit: "$" },
  // Endeksler
  { symbol: "XU100.IS", label: "BIST 100", unit: "" },
  { symbol: "ES=F", label: "S&P 500 Vad.", unit: "" },
  { symbol: "^VIX", label: "VIX", unit: "" },
  { symbol: "^GDAXI", label: "DAX", unit: "" },
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

function fmt(price: number, unit: string): string {
  if (price >= 10000) return `${unit}${price.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
  if (price >= 100) return `${unit}${price.toFixed(2)}`;
  return `${unit}${price.toFixed(4)}`;
}

export async function buildMacroBrief(date: string): Promise<string> {
  const results = await Promise.all(
    INSTRUMENTS.map(async ({ symbol, label, unit }) => {
      const q = await fetchQuote(symbol);
      if (!q) return null;
      const pct = ((q.price - q.prevClose) / q.prevClose) * 100;
      return { label, symbol, price: q.price, prevClose: q.prevClose, pct, unit } as MacroQuote;
    })
  );

  const lines: string[] = [
    `🌅 <b>Sabah Brifing</b> — ${date}`,
    "",
    "💱 <b>Kurlar</b>",
  ];

  const kurlar = results.slice(0, 2);
  const emtia = results.slice(2, 4);
  const endeksler = results.slice(4);

  for (const q of kurlar) {
    if (!q) continue;
    lines.push(`${arrow(q.pct)} ${q.label}: ${fmt(q.price, q.unit)} (${q.pct >= 0 ? "+" : ""}${q.pct.toFixed(2)}%)`);
  }

  lines.push("", "🪙 <b>Emtia</b>");
  for (const q of emtia) {
    if (!q) continue;
    lines.push(`${arrow(q.pct)} ${q.label}: ${fmt(q.price, q.unit)} (${q.pct >= 0 ? "+" : ""}${q.pct.toFixed(2)}%)`);
  }

  lines.push("", "📈 <b>Endeksler</b>");
  for (const q of endeksler) {
    if (!q) continue;
    const priceStr = q.unit
      ? `${q.unit}${q.price.toFixed(2)}`
      : q.price.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
    lines.push(`${arrow(q.pct)} ${q.label}: ${priceStr} (${q.pct >= 0 ? "+" : ""}${q.pct.toFixed(2)}%)`);
  }

  return lines.join("\n");
}
