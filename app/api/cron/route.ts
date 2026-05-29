import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { BIST100 } from "@/lib/bist100";
import { getWeeklyCloses, getCurrentPrice, getFundamentals, type Fundamentals } from "@/lib/yahoo";
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
  fundamentals: Fundamentals;
}

function fmtMarketCap(cap: number | null): string {
  if (!cap) return "—";
  if (cap >= 1e12) return `${(cap / 1e12).toFixed(1)}T₺`;
  if (cap >= 1e9) return `${(cap / 1e9).toFixed(1)}B₺`;
  if (cap >= 1e6) return `${(cap / 1e6).toFixed(0)}M₺`;
  return `${cap}₺`;
}

function rsiLabel(rsi: number | null): string {
  if (rsi === null) return "—";
  if (rsi < 30) return `${rsi} 🔴 Aşırı Satım`;
  if (rsi < 45) return `${rsi} 🟡 Zayıf`;
  if (rsi <= 55) return `${rsi} ⚪ Nötr`;
  if (rsi <= 70) return `${rsi} 🟢 Güçlü`;
  return `${rsi} 🔥 Aşırı Alım`;
}

function ema50Label(price: number, ema50: number | null, ema200: number): string {
  if (!ema50) return "—";
  const pos50 = price > ema50 ? "üstünde" : "altında";
  const cross = ema50 > ema200 ? "✅ Altın Kesişim" : "⚠️ Ölüm Kesişimi";
  return `${ema50.toFixed(2)}₺ (fiyat EMA50 ${pos50}) — ${cross}`;
}

async function buildStockAnalysis(stocks: StockResult[], date: string): Promise<string> {
  if (stocks.length === 0) return "";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const stockData = stocks.map((s) => {
    const ticker = s.symbol.replace(".IS", "");
    const direction = s.pct >= 0 ? "EMA200 üstünde" : "EMA200 altında";
    const cross = s.ema50 ? (s.ema50 > s.ema200 ? "Altın Kesişim (boğa)" : "Ölüm Kesişimi (ayı)") : "EMA50 yok";
    return [
      `HİSSE: ${ticker} (${s.name})`,
      `Fiyat: ${s.price.toFixed(2)}₺ — ${direction} (${s.pct.toFixed(2)}%)`,
      `EMA200: ${s.ema200.toFixed(2)}₺ | EMA50: ${s.ema50?.toFixed(2) ?? "—"}₺ | Kesişim: ${cross}`,
      `RSI(14 haftalık): ${s.rsi ?? "—"}`,
      `F/K: ${s.fundamentals.peRatio?.toFixed(1) ?? "—"} | PD/DD: ${s.fundamentals.pbRatio?.toFixed(2) ?? "—"} | Piyasa Değeri: ${fmtMarketCap(s.fundamentals.marketCap)}`,
      `52H Aralığı: ${s.fundamentals.week52Low?.toFixed(2) ?? "—"}₺ – ${s.fundamentals.week52High?.toFixed(2) ?? "—"}₺`,
    ].join("\n");
  }).join("\n\n---\n\n");

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1800,
      system: `Sen BIST uzmanı kıdemli bir portföy yöneticisisin. CEO'ya sabah raporu hazırlarsın.
Her hisse için kısa, net, aksiyon odaklı Türkçe yorum yaz. Teknik ve temel verileri birleştir.`,
      messages: [{
        role: "user",
        content: `Bugün (${date}) haftalık EMA 200'e dokunan BIST hisseleri:

${stockData}

Her hisse için şu formatı kullan (başka hiçbir şey ekleme):

🔵 <b>[TICKER] — [isim]</b> | [yön emoji] [pct]%
⚡ <i>Yorum:</i> [Teknik ve temel verileri harmanlayan 2-3 cümle. RSI durumu, EMA kesişimi, değerleme ne söylüyor? Yatırımcı ne yapmalı?]

(her hisse arasında boş satır)`,
      }],
    });
    return msg.content[0].type === "text" ? msg.content[0].text : "";
  } catch (err) {
    console.error("Claude analysis error:", err);
    return "";
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
  const macroBrief = await buildMacroBrief(date);
  await sendMessage(macroBrief);

  // 2. BIST 100 Haftalık EMA 200 taraması
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

        const price = await getCurrentPrice(symbol);
        if (!price) { errors.push(`${symbol}: fiyat alınamadı`); return; }

        const pct = pctDiff(price, ema200);
        if (Math.abs(pct) > TOUCH_THRESHOLD_PCT) return;

        const ema50 = getEMA50(closes);
        const rsi = calculateRSI(closes);
        const fundamentals = await getFundamentals(symbol);

        results.push({ symbol, name, price, ema200, ema50, rsi, pct, fundamentals });
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
  const aiAnalysis = await buildStockAnalysis(results, date);

  // 4. Mesaj formatı — ham veri + AI yorum
  const lines: string[] = [
    `📊 <b>BIST 100 Haftalık EMA 200 Taraması</b> — ${date}`,
    `🎯 ${results.length} hisse EMA 200'e dokunuyor (±%${TOUCH_THRESHOLD_PCT})`,
    "",
  ];

  for (const s of results) {
    const ticker = s.symbol.replace(".IS", "");
    const dir = s.pct >= 0 ? "🔼" : "🔽";
    lines.push(`${dir} <b>${ticker}</b> — ${s.price.toFixed(2)}₺ | EMA200: ${s.ema200.toFixed(2)}₺ (${s.pct >= 0 ? "+" : ""}${s.pct.toFixed(2)}%)`);
    lines.push(`   RSI: ${rsiLabel(s.rsi)} | EMA50: ${ema50Label(s.price, s.ema50, s.ema200)}`);
    lines.push(`   F/K: ${s.fundamentals.peRatio?.toFixed(1) ?? "—"} | PD/DD: ${s.fundamentals.pbRatio?.toFixed(2) ?? "—"} | PD: ${fmtMarketCap(s.fundamentals.marketCap)}`);
    lines.push("");
  }

  if (aiAnalysis) {
    lines.push("─────────────────────");
    lines.push("🤖 <b>AI Analizi:</b>");
    lines.push("");
    lines.push(aiAnalysis);
  }

  await sendMessage(lines.join("\n"));

  return NextResponse.json({
    scanned: BIST100.length,
    touching: results.length,
    errors: errors.length ? errors : undefined,
    results: results.map((r) => ({ symbol: r.symbol, price: r.price, ema200: r.ema200, pct: parseFloat(r.pct.toFixed(2)), rsi: r.rsi })),
  });
}
