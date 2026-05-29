import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { BIST100 } from "@/lib/bist100";
import { getWeeklyCloses, getPriceInfo } from "@/lib/yahoo";
import { getEMA200, getEMA50, calculateRSI, pctDiff } from "@/lib/ema";
import { sendMessage } from "@/lib/telegram";
import { buildMacroBrief } from "@/lib/macro";

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
  ema50: number | null;
  rsi: number | null;
  pct: number;
  week52High: number | null;
  week52Low: number | null;
}

function rsiLabel(rsi: number | null): string {
  if (rsi === null) return "—";
  if (rsi < 30) return `${rsi} 🔴 Aşırı Satım`;
  if (rsi < 45) return `${rsi} 🟡 Zayıf`;
  if (rsi <= 55) return `${rsi} ⚪ Nötr`;
  if (rsi <= 70) return `${rsi} 🟢 Güçlü`;
  return `${rsi} 🔥 Aşırı Alım`;
}

function crossLabel(ema50: number | null, ema200: number): string {
  if (!ema50) return "—";
  return ema50 > ema200 ? "✅ Altın Kesişim" : "⚠️ Ölüm Kesişimi";
}

// Returns one AI comment per stock, same order as input
async function buildStockAnalyses(stocks: StockResult[], date: string): Promise<string[]> {
  if (stocks.length === 0) return [];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const stockData = stocks.map((s, i) => {
    const ticker = s.symbol.replace(".IS", "");
    const dir = s.pct >= 0 ? "üstünde" : "altında";
    const range = s.week52High && s.week52Low
      ? `${s.week52Low.toFixed(2)}₺ – ${s.week52High.toFixed(2)}₺`
      : "—";
    return [
      `#${i + 1} ${ticker} (${s.name})`,
      `Haftalık EMA200: ${s.ema200.toFixed(2)}₺ | Fiyat: ${s.price.toFixed(2)}₺ (EMA200 ${dir}, ${s.pct.toFixed(2)}%)`,
      `RSI(14 haftalık): ${s.rsi ?? "—"} | EMA50/EMA200 kesişimi: ${crossLabel(s.ema50, s.ema200)}`,
      `52 haftalık aralık: ${range}`,
    ].join("\n");
  }).join("\n\n");

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1600,
      system: `Sen BIST uzmanı portföy yöneticisisin. CEO'ya kısa, net, aksiyon odaklı Türkçe rapor yazarsın.`,
      messages: [{
        role: "user",
        content: `Bugün (${date}) haftalık EMA 200 seviyesine dokunan BIST hisseleri:

${stockData}

Önemli: Bu hisseler haftalık EMA 200'e dokunuyor — bu kritik bir destek/direnç seviyesidir.
Her hisse için EMA 200 seviyesinin önemi üzerinden yorum yap.

Her hisse için SADECE şu format, hisseler arasında ---SEP---:

⚡ <i>EMA200 Yorumu:</i> [EMA200 seviyesinde ne oluyor? RSI bunu nasıl destekliyor/çürütüyor? 52H aralığında nerede? Yatırımcı ne yapmalı? 2-3 cümle.]

---SEP---`,
      }],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
    const parts = raw.split("---SEP---").map((s) => s.trim()).filter(Boolean);
    while (parts.length < stocks.length) parts.push("");
    return parts.slice(0, stocks.length);
  } catch (err) {
    console.error("Claude analysis error:", err);
    return stocks.map(() => "");
  }
}

export async function GET(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return NextResponse.json({ error: "Server misconfiguration: CRON_SECRET not set" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const secret = req.headers.get("x-cron-secret") ?? bearerToken;
  if (secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

  // 1. Sabah brifing
  await sendMessage(await buildMacroBrief(date));

  // 2. BIST 100 haftalık EMA 200 taraması
  const results: StockResult[] = [];
  const errors: string[] = [];

  for (let i = 0; i < BIST100.length; i += BATCH_SIZE) {
    const batch = BIST100.slice(i, i + BATCH_SIZE).filter(
      (v, idx, arr) => arr.findIndex((x) => x.symbol === v.symbol) === idx
    );

    await Promise.all(
      batch.map(async ({ symbol, name }) => {
        const closes = await getWeeklyCloses(symbol, 250);
        if (closes.length < 200) {
          errors.push(`${symbol}: yetersiz veri (${closes.length})`);
          return;
        }

        const ema200 = getEMA200(closes);
        if (!ema200) return;

        const info = await getPriceInfo(symbol);
        if (!info) { errors.push(`${symbol}: fiyat alınamadı`); return; }

        const pct = pctDiff(info.price, ema200);
        if (Math.abs(pct) > TOUCH_THRESHOLD_PCT) return;

        results.push({
          symbol, name,
          price: info.price,
          ema200,
          ema50: getEMA50(closes),
          rsi: calculateRSI(closes),
          pct,
          week52High: info.week52High,
          week52Low: info.week52Low,
        });
      })
    );

    if (i + BATCH_SIZE < BIST100.length) await sleep(BATCH_DELAY_MS);
  }

  results.sort((a, b) => a.pct - b.pct);

  if (results.length === 0) {
    await sendMessage(`📊 <b>BIST 100 Haftalık EMA 200</b> — ${date}\n\nBugün EMA 200'e dokunan hisse bulunamadı.`);
    return NextResponse.json({ scanned: BIST100.length, touching: 0, errors: errors.length ? errors : undefined });
  }

  // 3. AI analizi
  const analyses = await buildStockAnalyses(results, date);

  // 4. Mesaj
  const lines: string[] = [
    `📊 <b>BIST 100 Haftalık EMA 200 Taraması</b> — ${date}`,
    `🎯 ${results.length} hisse EMA 200'e dokunuyor (±%${TOUCH_THRESHOLD_PCT})`,
    "",
  ];

  for (let i = 0; i < results.length; i++) {
    const s = results[i];
    const ticker = s.symbol.replace(".IS", "");
    const dir = s.pct >= 0 ? "🔼" : "🔽";
    const range = s.week52High && s.week52Low
      ? `${s.week52Low.toFixed(2)}₺ – ${s.week52High.toFixed(2)}₺`
      : "—";
    lines.push(`${dir} <b>${ticker}</b> — ${s.price.toFixed(2)}₺ | EMA200: ${s.ema200.toFixed(2)}₺ (${s.pct >= 0 ? "+" : ""}${s.pct.toFixed(2)}%)`);
    lines.push(`   📊 RSI: ${rsiLabel(s.rsi)} | ${crossLabel(s.ema50, s.ema200)}`);
    lines.push(`   📉 52H: ${range}`);
    if (analyses[i]) lines.push(`   ${analyses[i]}`);
    lines.push("");
  }

  await sendMessage(lines.join("\n"));

  return NextResponse.json({
    scanned: BIST100.length,
    touching: results.length,
    errors: errors.length ? errors : undefined,
    results: results.map((r) => ({ symbol: r.symbol, price: r.price, ema200: r.ema200, pct: parseFloat(r.pct.toFixed(2)), rsi: r.rsi })),
  });
}
