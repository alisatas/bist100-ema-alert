import Anthropic from "@anthropic-ai/sdk";
import { fetchNewsHeadlines } from "@/lib/news";

const SYSTEM_PROMPT = `Sen deneyimli bir Türk finans analistisin.
BIST ve Türk ekonomisi odaklı düşünürsün.
Yanıtlarını her zaman Türkçe ve kısa yaz.`;

export async function buildNewsBrief(date: string): Promise<string> {
  const headlines = await fetchNewsHeadlines();

  if (headlines.length === 0) {
    return `📰 <b>Piyasa Haberleri</b> — ${date}\n\nHaber kaynakları şu an erişilemiyor.`;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = `Bugünkü Türk finans haber başlıkları:

${headlines.slice(0, 50).join("\n")}

Görevin:
1. BIST ve Türk ekonomisi açısından bugün en kritik 1-2 haberi seç
2. Her haber için 2-3 cümlelik Türkçe özet yaz
3. Piyasaya olası etkisini belirt (🟢 Olumlu / 🔴 Olumsuz / 🟡 Nötr)

Çıktı formatı (başka hiçbir şey yazma):
📌 <b>HABER 1:</b> [Başlık]
📝 <i>Özet:</i> ...
📊 Etki: 🟢/🔴/🟡 ...

📌 <b>HABER 2:</b> [Başlık]
📝 <i>Özet:</i> ...
📊 Etki: 🟢/🔴/🟡 ...`;

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const analysis = msg.content[0].type === "text" ? msg.content[0].text : "";

    return `📰 <b>Piyasa Haberleri</b> — ${date}\n\n${analysis}`;
  } catch (err) {
    console.error("Claude API error:", err);
    return `📰 <b>Piyasa Haberleri</b> — ${date}\n\nHaber analizi şu an yapılamıyor.`;
  }
}
