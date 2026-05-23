const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/",
};

interface YahooChartResult {
  chart: {
    result?: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{ close: (number | null)[] }>;
      };
      meta: { regularMarketPrice: number };
    }>;
    error?: { description: string };
  };
}

export async function getHistoricalCloses(
  symbol: string,
  days = 260
): Promise<number[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
    const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
    if (!res.ok) return [];

    const data: YahooChartResult = await res.json();
    const result = data.chart.result?.[0];
    if (!result) return [];

    const closes = result.indicators.quote[0].close;
    return closes
      .filter((c): c is number => c != null)
      .slice(-days);
  } catch {
    return [];
  }
}

export async function getCurrentPrice(symbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
    if (!res.ok) return null;

    const data: YahooChartResult = await res.json();
    const result = data.chart.result?.[0];
    if (!result) return null;

    return result.meta.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}
