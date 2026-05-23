// query2 subdomain works from serverless environments without crumb/cookie
const BASE = "https://query2.finance.yahoo.com/v8/finance/chart";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Origin": "https://finance.yahoo.com",
  "Referer": "https://finance.yahoo.com/",
};

interface YahooChartResult {
  chart: {
    result?: Array<{
      indicators: { quote: Array<{ close: (number | null)[] }> };
      meta: { regularMarketPrice: number };
    }>;
    error?: unknown;
  };
}

async function fetchChart(symbol: string, range: string): Promise<YahooChartResult | null> {
  try {
    const url = `${BASE}/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
    const res = await fetch(url, { headers: { ...HEADERS, Referer: `https://finance.yahoo.com/quote/${symbol}/` }, cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getHistoricalCloses(
  symbol: string,
  days = 260
): Promise<number[]> {
  try {
    const data = await fetchChart(symbol, "1y");
    const result = data?.chart.result?.[0];
    if (!result) return [];
    return result.indicators.quote[0].close
      .filter((c): c is number => c != null)
      .slice(-days);
  } catch {
    return [];
  }
}

export async function getCurrentPrice(symbol: string): Promise<number | null> {
  try {
    const data = await fetchChart(symbol, "5d");
    const result = data?.chart.result?.[0];
    return result?.meta.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}
