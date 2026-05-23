const BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function sendMessage(text: string): Promise<boolean> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    console.error("TELEGRAM_CHAT_ID is not set");
    return false;
  }

  const res = await fetch(`${BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Telegram error:", err);
    return false;
  }
  return true;
}

export async function getUpdates(): Promise<unknown> {
  const res = await fetch(`${BASE}/getUpdates`);
  return res.json();
}
