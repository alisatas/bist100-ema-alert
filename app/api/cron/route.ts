import { NextRequest, NextResponse } from "next/server";
import { BIST100 } from "@/lib/bist100";
import { getHistoricalCloses, getCurrentPrice } from "@/lib/yahoo";
import { getEMA200, pctDiff } from "@/lib/ema";
import { sendMessage } from "@/lib/telegram";
import { buildMacroBrief } from "@/lib/macro";
// Haberler artık /api/news endpoint'i tarafından 10:30'da ayrıca gönderiliyor

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 300;
const TOUCH_THRESHOLD_PCT = 2;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface StockResult {
  symbol: string;
  name: string;
  price: number;
  ema200: number;
  pct: number;
}

function formatAlert(above: StockResult[], below: StockResult[], date: string): string {
  const lines: string[] = [
    `📊 <b>BIST 100 EMA 200 Taraması</b> — ${date}`,
    `🎯 EMA 200'e Dokunan Hisseler (±%${TOUCH_THRESHOLD_PCT})`,
    "",
  ];

  if (above.length > 0) {
    lines.push("🔼 <b>EMA 200 Üstünde Olanlar:</b>");
    for (const s of above) {
      lines.push(
        `• <b>${s.symbol.replace(".IS", "")}</b> — ${s.price.toFixed(2)} ₺` +
          ` (EMA 200: ${s.ema200.toFixed(2)} ₺, +${s.pct.toFixed(2)}%)`
      );
    }
    lines.push("");
  }

  if (below.length > 0) {
    lines.push("🔽 <b>EMA 200 Altında Olanlar:</b>");
    for (const s of below) {
      lines.push(
        `• <b>${s.symbol.replace(".IS", "")}</b> — ${s.price.toFixed(2)} ₺` +
          ` (EMA 200: ${s.ema200.toFixed(2)} ₺, ${s.pct.toFixed(2)}%)`
      );
    }
    lines.push("");
  }

  lines.push(`Toplam: ${above.length + below.length} hisse`);
  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  // Security: CRON_SECRET must always be set in production
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    console.error("CRON_SECRET env variable is not set — endpoint is unprotected!");
    return NextResponse.json({ error: "Server misconfiguration: CRON_SECRET not set" }, { status: 500 });
  }

  // Accept Vercel's built-in cron header OR a custom x-cron-secret header
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("x-vercel-cron-secret");
  if (secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = new Date().toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // 1. Sabah brifing — makro + global piyasalar (10:00 TR)
  const macroBrief = await buildMacroBrief(date);
  await sendMessage(macroBrief);

  // 2. BIST 100 EMA 200 taraması (10:00 TR)
  // Not: Haber bülteni /api/news tarafından 10:30'da ayrıca gönderilir
  const results: StockResult[] = [];
  const errors: string[] = [];

  // Process in batches to avoid rate limits
  for (let i = 0; i < BIST100.length; i += BATCH_SIZE) {
    const batch = BIST100.slice(i, i + BATCH_SIZE);

    // Deduplicate (bist100 list has one duplicate)
    const unique = batch.filter(
      (v, idx, arr) => arr.findIndex((x) => x.symbol === v.symbol) === idx
    );

    await Promise.all(
      unique.map(async ({ symbol, name }) => {
        const closes = await getHistoricalCloses(symbol, 260);
        if (closes.length < 200) {
          errors.push(`${symbol}: yetersiz veri (${closes.length} gün)`);
          return;
        }

        const ema200 = getEMA200(closes);
        if (!ema200) return;

        const price = await getCurrentPrice(symbol);
        if (!price) {
          errors.push(`${symbol}: fiyat alınamadı`);
          return;
        }

        const pct = pctDiff(price, ema200);
        if (Math.abs(pct) <= TOUCH_THRESHOLD_PCT) {
          results.push({ symbol, name, price, ema200, pct });
        }
      })
    );

    if (i + BATCH_SIZE < BIST100.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  results.sort((a, b) => a.pct - b.pct);
  const above = results.filter((s) => s.pct >= 0);
  const below = results.filter((s) => s.pct < 0);

  let messageSent = false;
  if (results.length > 0) {
    const msg = formatAlert(above, below, date);
    messageSent = await sendMessage(msg);
  } else {
    await sendMessage(`📊 BIST 100 EMA 200 Taraması — ${date}\n\nBugün EMA 200'e dokunan hisse bulunamadı.`);
    messageSent = true;
  }

  return NextResponse.json({
    scanned: BIST100.length,
    touching: results.length,
    above: above.length,
    below: below.length,
    messageSent,
    errors: errors.length > 0 ? errors : undefined,
    results: results.map((r) => ({
      symbol: r.symbol,
      price: r.price,
      ema200: r.ema200,
      pct: parseFloat(r.pct.toFixed(2)),
    })),
  });
}
