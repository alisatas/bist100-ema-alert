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

export function getEMA50(closes: number[]): number | null {
  if (closes.length < 50) return null;
  const ema = calculateEMA(closes, 50);
  return ema[ema.length - 1];
}

export function pctDiff(price: number, ema: number): number {
  return ((price - ema) / ema) * 100;
}

// Simple RSI using Wilder's smoothing (standard)
export function calculateRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  const recent = closes.slice(-(period * 3)); // enough history for smoothing
  let avgGain = 0;
  let avgLoss = 0;

  // Initial averages
  for (let i = 1; i <= period; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder smoothing for remaining bars
  for (let i = period + 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(1));
}
