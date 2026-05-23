import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchNewsHeadlines, type NewsItem } from "@/lib/news";
import { sendMessage } from "@/lib/telegram";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Agent Step 1: Filter ──────────────────────────────────────────────────────
// Returns indices (1-based) of headlines that are relevant to stocks/markets
async function filterRelevantNews(items: NewsItem[]): Promise<number[]> {
  const numbered = items.slice(0, 80).map((item, i) => `${i + 1}. ${item.title}`).join("\n");

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    system: `Sen BIST ve Türk piyasaları uzmanı bir analistsin.
Görevin: Verilen haber listesinden YALNIZCA aşağıdakilerle ilgili haberlerin numaralarını seç:
- BIST'te işlem gören şirketler (kazanç, yönetim değişikliği, birleşme, ihracat, üretim)
- Bankacılık, enerji, sanayi, perakende, teknoloji sektör haberleri
- TCMB kararları, enflasyon, faiz, döviz politikası
- Uluslararası ticaret, hammadde fiyatları, emtia (piyasaya etkisi olan)
- Büyük şirket haberleri (Ford, Sabancı, Koç, Eczacıbaşı, Türk Telekom vb.)

REDDET: Spor, eğlence, siyasi tartışma, suç, hava durumu, sosyal medya haberleri.

Yanıt olarak SADECE virgülle ayrılmış sayılar yaz. Örnek: 2,5,11,23,31`,
    messages: [{ role: "user", content: `Haber listesi:\n${numbered}\n\nFinans/piyasa haberi olan numaralar:` }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  return text
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 1 && n <= items.length);
}

// ── Agent Step 2: Analyze ─────────────────────────────────────────────────────
// CEO-level deep analysis of filtered headlines
async function analyzeForCEO(items: NewsItem[], date: string): Promise<string> {
  const headlines = items.map((item, i) => `${i + 1}. [${item.source}] ${item.title}`).join("\n");

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: `Sen kıdemli bir portföy yöneticisisin. Her sabah CEO'ya piyasa özeti raporu hazırlarsın.
Raporun üslubu: net, kısa, aksiyon odaklı. Gereksiz giriş cümlesi yok.
Her haber için şu soruları yanıtla: Ne oldu? Hangi hisseler etkilenir? Yatırımcı ne yapmalı?`,
    messages: [{
      role: "user",
      content: `Bugün (${date}) piyasayla ilgili seçilmiş haberler:\n\n${headlines}\n\nCEO raporu hazırla. Şu formatı kullan:\n\n📌 <b>[Haber başlığı]</b>\n📝 <i>Durum:</i> [Ne oldu, 1-2 cümle]\n📊 <i>Etkilenen hisseler/sektörler:</i> [spesifik hisse veya sektör adları]\n⚡ <i>Aksiyon:</i> 🟢 Fırsat / 🔴 Risk / 🟡 İzle — [1 cümle]\n\n(sonraki haber için boş satır bırak)`,
    }],
  });

  return msg.content[0].type === "text" ? msg.content[0].text : "";
}

// ─────────────────────────────────────────────────────────────────────────────

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

  const date = new Date().toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const allItems = await fetchNewsHeadlines();

  if (allItems.length === 0) {
    await sendMessage(`📰 <b>Sabah Haber Bülteni</b> — ${date}\n\nHaber kaynakları şu an erişilemiyor.`);
    return NextResponse.json({ sent: true, headlinesFetched: 0 });
  }

  try {
    // Step 1 — Filter: find market-relevant headlines
    const relevantIndices = await filterRelevantNews(allItems);
    const relevantItems = relevantIndices.map((i) => allItems[i - 1]).filter(Boolean);

    if (relevantItems.length === 0) {
      await sendMessage(`📰 <b>Sabah Haber Bülteni</b> — ${date}\n\nBugün piyasayla doğrudan ilgili haber bulunamadı.`);
      return NextResponse.json({ sent: true, headlinesFetched: allItems.length, relevant: 0 });
    }

    // Step 2 — Analyze: CEO-level report
    const analysis = await analyzeForCEO(relevantItems, date);

    // Links — only relevant items with valid URLs
    const links = relevantItems
      .filter((item) => item.url.startsWith("http"))
      .slice(0, 8)
      .map((item) => `• <a href="${item.url}">[${item.source}] ${item.title.slice(0, 55)}${item.title.length > 55 ? "…" : ""}</a>`)
      .join("\n");

    const fullMessage = [
      `📰 <b>Sabah Haber Bülteni</b> — ${date}`,
      `🔍 <i>${allItems.length} haber tarandı → ${relevantItems.length} piyasa haberi seçildi</i>`,
      "",
      analysis,
      "",
      "🔗 <b>Kaynaklar:</b>",
      links || "(link mevcut değil)",
    ].join("\n");

    const sent = await sendMessage(fullMessage);

    return NextResponse.json({
      date,
      headlinesFetched: allItems.length,
      relevant: relevantItems.length,
      sent,
    });
  } catch (err) {
    console.error("Agent error:", err);
    await sendMessage(`📰 <b>Sabah Haber Bülteni</b> — ${date}\n\nHaber analizi şu an yapılamıyor.`);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
