import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchNewsHeadlines } from "@/lib/news";
import { sendMessage } from "@/lib/telegram";

const SYSTEM_PROMPT = `Sen deneyimli bir Türk finans analistisin.
BIST ve Türk ekonomisi odaklı düşünürsün.
Yanıtlarını her zaman Türkçe ve kısa yaz.`;

export async function GET(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    console.error("CRON_SECRET env variable is not set — endpoint is unprotected!");
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

  const items = await fetchNewsHeadlines();

  if (items.length === 0) {
    await sendMessage(`📰 <b>Sabah Haber Bülteni</b> — ${date}\n\nHaber kaynakları şu an erişilemiyor.`);
    return NextResponse.json({ sent: true, headlinesFetched: 0 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Send only titles to Claude for analysis
  const titlesForClaude = items.slice(0, 60).map((item, i) => `${i + 1}. ${item.title}`).join("\n");

  const userPrompt = `Bugünkü Türk finans haber başlıkları (${items.length} haber):

${titlesForClaude}

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

  // Build links section — top items that have a URL
  const withLinks = items.slice(0, 20).filter((item) => item.url.startsWith("http"));
  const linksSection = withLinks.slice(0, 8)
    .map((item) => `• <a href="${item.url}">${item.source}: ${item.title.slice(0, 60)}${item.title.length > 60 ? "…" : ""}</a>`)
    .join("\n");

  const fullMessage = [
    `📰 <b>Sabah Haber Bülteni</b> — ${date}`,
    `🔍 <i>${items.length} haber tarandı, en önemlileri:</i>`,
    "",
    analysis,
    "",
    "🔗 <b>Haberler:</b>",
    linksSection,
  ].join("\n");

  const sent = await sendMessage(fullMessage);

  return NextResponse.json({ date, headlinesFetched: items.length, sent });
}
