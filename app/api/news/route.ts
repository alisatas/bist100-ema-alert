import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchNewsHeadlines, type NewsItem } from "@/lib/news";
import { sendMessage } from "@/lib/telegram";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function filterRelevantNews(items: NewsItem[]): Promise<number[]> {
  const numbered = items.slice(0, 80).map((item, i) => `${i + 1}. ${item.title}`).join("\n");

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 200,
    system: `BIST ve Türk piyasaları uzmanısın. Yalnızca şunlarla ilgili haberlerin numaralarını seç:
- BIST'te işlem gören şirketler (kazanç, yönetim, birleşme, ihracat, üretim)
- Bankacılık, enerji, sanayi, perakende, teknoloji sektörleri
- TCMB, faiz, enflasyon, döviz politikası
- Piyasayı etkileyen uluslararası ticaret ve emtia haberleri

REDDET: Spor, eğlence, siyaset, suç, hava, sosyal medya.
Yanıt: sadece virgülle ayrılmış sayılar. Örnek: 2,5,11,23`,
    messages: [{ role: "user", content: `Haberler:\n${numbered}\n\nFinans/piyasa haberi numaraları:` }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  return text
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 1 && n <= items.length);
}

async function analyzeForCEO(items: NewsItem[], date: string): Promise<string> {
  const headlines = items.slice(0, 6).map((item, i) => `${i + 1}. [${item.source}] ${item.title}`).join("\n");

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    system: `Kıdemli portföy yöneticisisin. CEO'ya sabah piyasa özeti raporu hazırlarsın.
Üslup: net, kısa, aksiyon odaklı. Gereksiz giriş yok.`,
    messages: [{
      role: "user",
      content: `Bugün (${date}) seçilmiş piyasa haberleri:\n\n${headlines}\n\nHer haber için:\n\n📌 <b>[Başlık]</b>\n📝 <i>Durum:</i> [Ne oldu, 1-2 cümle]\n📊 <i>Etkilenen:</i> [Hisse/sektör adları]\n⚡ <i>Aksiyon:</i> 🟢 Fırsat / 🔴 Risk / 🟡 İzle — [1 cümle]\n\n(araya boş satır bırak)`,
    }],
  });

  return msg.content[0].type === "text" ? msg.content[0].text : "";
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
  const allItems = await fetchNewsHeadlines();

  if (allItems.length === 0) {
    await sendMessage(`📰 <b>Sabah Haber Bülteni</b> — ${date}\n\nHaber kaynakları şu an erişilemiyor.`);
    return NextResponse.json({ sent: true, headlinesFetched: 0 });
  }

  try {
    const relevantIndices = await filterRelevantNews(allItems);
    const relevantItems = relevantIndices.map((i) => allItems[i - 1]).filter(Boolean);

    if (relevantItems.length === 0) {
      await sendMessage(`📰 <b>Sabah Haber Bülteni</b> — ${date}\n\nBugün piyasayla doğrudan ilgili haber bulunamadı.`);
      return NextResponse.json({ sent: true, headlinesFetched: allItems.length, relevant: 0 });
    }

    const analysis = await analyzeForCEO(relevantItems, date);

    const fullMessage = [
      `📰 <b>Sabah Haber Bülteni</b> — ${date}`,
      `🔍 <i>${allItems.length} haberden ${relevantItems.length} piyasa haberi seçildi</i>`,
      "",
      analysis,
    ].join("\n");

    const sent = await sendMessage(fullMessage);
    return NextResponse.json({ date, headlinesFetched: allItems.length, relevant: relevantItems.length, sent });
  } catch (err) {
    console.error("Agent error:", err);
    await sendMessage(`📰 <b>Sabah Haber Bülteni</b> — ${date}\n\nHaber analizi şu an yapılamıyor.`);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
