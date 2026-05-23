const MAX_LEN = 4000;

interface BotTarget {
  token: string;
  chatId: string;
}

async function sendSingle(token: string, chatId: string, text: string): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
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

function splitMessage(text: string): string[] {
  if (text.length <= MAX_LEN) return [text];
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
  return parts;
}

function getBotTargets(): BotTarget[] {
  const targets: BotTarget[] = [];

  // Bot 1 (primary)
  const token1 = process.env.TELEGRAM_BOT_TOKEN;
  const chatId1 = process.env.TELEGRAM_CHAT_ID;
  if (token1 && chatId1) targets.push({ token: token1, chatId: chatId1 });

  // Bot 2 (optional second bot)
  const token2 = process.env.TELEGRAM_BOT_TOKEN_2;
  const chatId2 = process.env.TELEGRAM_CHAT_ID_2;
  if (token2 && chatId2) targets.push({ token: token2, chatId: chatId2 });

  return targets;
}

export async function sendMessage(text: string): Promise<boolean> {
  const targets = getBotTargets();

  if (targets.length === 0) {
    console.error("No Telegram bot targets configured");
    return false;
  }

  const parts = splitMessage(text);
  let ok = true;

  for (const { token, chatId } of targets) {
    for (const part of parts) {
      const result = await sendSingle(token, chatId, part);
      if (!result) ok = false;
    }
  }
  return ok;
}

export async function getUpdates(): Promise<unknown> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  return res.json();
}
