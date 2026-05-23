// eslint-disable-next-line @typescript-eslint/no-require-imports
const yahooFinance = require("yahoo-finance2").default;

interface HistoricalRow {
  date: Date;
  close: number | null;
}

interface QuoteResult {
  regularMarketPrice?: number;
}

export async function getHistoricalCloses(
  symbol: string,
  days = 260
): Promise<number[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    const result: HistoricalRow[] = await yahooFinance.historical(symbol, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    });

    return result
      .filter((r) => r.close != null)
      .map((r) => r.close as number);
  } catch {
    return [];
  }
}

export async function getCurrentPrice(symbol: string): Promise<number | null> {
  try {
    const quote: QuoteResult = await yahooFinance.quote(symbol);
    return quote.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}
