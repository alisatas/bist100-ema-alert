const BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const MAX_LEN = 4000;

async function sendSingle(chatId: string, text: string): Promise<boolean> {
  const res = await fetch(`${BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    console.error("Telegram error:", await res.text());
    return false;
  }
  return true;
}

export async function sendMessage(text: string): Promise<boolean> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    console.error("TELEGRAM_CHAT_ID is not set");
    return false;
  }

  if (text.length <= MAX_LEN) {
    return sendSingle(chatId, text);
  }

  // Split on double newlines to avoid breaking HTML tags mid-way
  const parts: string[] = [];
  let current = "";
  for (const paragraph of text.split("\n\n")) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > MAX_LEN && current) {
      parts.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);

  let ok = true;
  for (const part of parts) {
    const result = await sendSingle(chatId, part);
    if (!result) ok = false;
  }
  return ok;
}

export async function getUpdates(): Promise<unknown> {
  const res = await fetch(`${BASE}/getUpdates`);
  return res.json();
}
