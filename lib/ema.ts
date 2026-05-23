export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    result.push(prices[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

export function getEMA200(closes: number[]): number | null {
  if (closes.length < 200) return null;
  const ema = calculateEMA(closes, 200);
  return ema[ema.length - 1];
}

export function pctDiff(price: number, ema: number): number {
  return ((price - ema) / ema) * 100;
}
