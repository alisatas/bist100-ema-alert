// query2 subdomain works from serverless environments without crumb/cookie
const BASE = "https://query2.finance.yahoo.com/v8/finance/chart";
const SUMMARY_BASE = "https://query2.finance.yahoo.com/v10/finance/quoteSummary";

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
      meta: { regularMarketPrice: number; fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number };
    }>;
    error?: unknown;
  };
}

export interface Fundamentals {
  peRatio: number | null;
  pbRatio: number | null;
  marketCap: number | null;
  week52High: number | null;
  week52Low: number | null;
  epsTrailing: number | null;
}

async function fetchChart(
  symbol: string,
  interval: "1d" | "1wk",
  range: string
): Promise<YahooChartResult | null> {
  try {
    const url = `${BASE}/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const res = await fetch(url, {
      headers: { ...HEADERS, Referer: `https://finance.yahoo.com/quote/${symbol}/` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getWeeklyCloses(symbol: string, weeks = 250): Promise<number[]> {
  try {
    const data = await fetchChart(symbol, "1wk", "5y");
    const result = data?.chart.result?.[0];
    if (!result) return [];
    return result.indicators.quote[0].close
      .filter((c): c is number => c != null)
      .slice(-weeks);
  } catch {
    return [];
  }
}

export async function getCurrentPrice(symbol: string): Promise<number | null> {
  try {
    const data = await fetchChart(symbol, "1d", "5d");
    const result = data?.chart.result?.[0];
    return result?.meta.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

export async function getFundamentals(symbol: string): Promise<Fundamentals> {
  const empty: Fundamentals = { peRatio: null, pbRatio: null, marketCap: null, week52High: null, week52Low: null, epsTrailing: null };
  try {
    const url = `${SUMMARY_BASE}/${encodeURIComponent(symbol)}?modules=summaryDetail,defaultKeyStatistics`;
    const res = await fetch(url, {
      headers: { ...HEADERS, Referer: `https://finance.yahoo.com/quote/${symbol}/` },
      cache: "no-store",
    });
    if (!res.ok) return empty;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const r = data?.quoteSummary?.result?.[0];
    if (!r) return empty;
    const sd = r.summaryDetail ?? {};
    const ks = r.defaultKeyStatistics ?? {};
    return {
      peRatio: sd.trailingPE?.raw ?? null,
      pbRatio: ks.priceToBook?.raw ?? null,
      marketCap: sd.marketCap?.raw ?? null,
      week52High: sd.fiftyTwoWeekHigh?.raw ?? null,
      week52Low: sd.fiftyTwoWeekLow?.raw ?? null,
      epsTrailing: ks.trailingEps?.raw ?? null,
    };
  } catch {
    return empty;
  }
}
