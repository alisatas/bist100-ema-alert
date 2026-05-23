import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchNewsHeadlines } from "@/lib/news";
import { sendMessage } from "@/lib/telegram";

const SYSTEM_PROMPT = `Sen deneyimli bir Türk finans analistisin.
BIST ve Türk ekonomisi odaklı düşünürsün.
Yanıtlarını her zaman Türkçe ve kısa yaz.`;

export async function GET(req: NextRequest) {
  // Security: CRON_SECRET must always be set in production
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    console.error("CRON_SECRET env variable is not set — endpoint is unprotected!");
    return NextResponse.json({ error: "Server misconfiguration: CRON_SECRET not set" }, { status: 500 });
  }

  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("x-vercel-cron-secret");
  if (secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = new Date().toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // 1. Haber başlıklarını çek
  const headlines = await fetchNewsHeadlines();

  if (headlines.length === 0) {
    const msg = `📰 <b>Sabah Haber Bülteni</b> — ${date}\n\nHaber kaynakları şu an erişilemiyor.`;
    await sendMessage(msg);
    return NextResponse.json({ sent: true, headlines: 0 });
  }

  // 2. Claude ile en önemli 3-4 haberi seç ve analiz et
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = `Bugünkü Türk finans haber başlıkları (${headlines.length} haber):

${headlines.slice(0, 60).join("\n")}

Görevin:
- BIST ve Türk ekonomisi açısından bugün en kritik 3-4 haberi seç
- Her haber için 2-3 cümlelik Türkçe özet yaz
- Yatırımcıya olası piyasa etkisini belirt

Çıktı formatı (başka hiçbir şey yazma, sadece bu format):
📌 <b>[Haber başlığı]</b>
📝 <i>Özet:</i> [2-3 cümle]
📊 <i>Etki:</i> 🟢 Olumlu / 🔴 Olumsuz / 🟡 Nötr — [kısa açıklama]

(sonraki haber için boş satır bırak)`;

  let analysis = "";
  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
    analysis = msg.content[0].type === "text" ? msg.content[0].text : "";
  } catch (err) {
    console.error("Claude API error:", err);
    analysis = "Haber analizi şu an yapılamıyor.";
  }

  const fullMessage = `📰 <b>Sabah Haber Bülteni</b> — ${date}\n🔍 <i>${headlines.length} haber tarandı, en önemlileri:</i>\n\n${analysis}`;

  const sent = await sendMessage(fullMessage);

  return NextResponse.json({
    date,
    headlinesFetched: headlines.length,
    sent,
  });
}
