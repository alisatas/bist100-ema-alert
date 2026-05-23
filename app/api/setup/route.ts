import { NextResponse } from "next/server";

const BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

interface TelegramUpdate {
  message?: { chat: { id: number; first_name?: string } };
}

// Temporarily removes webhook, fetches updates to get chat_id, then restores webhook.
// Visit once after sending /start to your bot.
export async function GET() {
  // 1. Get current webhook URL so we can restore it
  const webhookInfo = await fetch(`${BASE}/getWebhookInfo`).then((r) => r.json()) as {
    ok: boolean;
    result: { url: string };
  };
  const existingWebhook = webhookInfo.ok ? webhookInfo.result.url : "";

  // 2. Delete webhook temporarily (keeps pending updates)
  await fetch(`${BASE}/deleteWebhook?drop_pending_updates=false`);

  // 3. Get updates
  const updatesRes = await fetch(`${BASE}/getUpdates?limit=50`).then((r) => r.json()) as {
    ok: boolean;
    result: TelegramUpdate[];
  };

  // 4. Restore webhook if one existed
  if (existingWebhook) {
    await fetch(`${BASE}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: existingWebhook }),
    });
  }

  if (!updatesRes.ok) {
    return NextResponse.json({ error: "getUpdates failed after webhook removal" }, { status: 500 });
  }

  const chats = updatesRes.result
    .filter((u) => u.message?.chat)
    .map((u) => ({
      chat_id: u.message!.chat.id,
      name: u.message!.chat.first_name ?? "unknown",
    }));

  const unique = [...new Map(chats.map((c) => [c.chat_id, c])).values()];

  if (unique.length === 0) {
    return NextResponse.json({
      instruction: "Bot ile henüz hiç mesajlaşılmamış. @alisatass_bot botuna /start gönderin ve tekrar deneyin.",
      tip: "Veya Telegram'da @userinfobot'a yazarak ID'nizi öğrenebilirsiniz.",
      webhook_restored: !!existingWebhook,
    });
  }

  return NextResponse.json({
    instruction: "Aşağıdaki chat_id'yi TELEGRAM_CHAT_ID env değişkeni olarak ekleyin",
    chats: unique,
    webhook_restored: !!existingWebhook,
  });
}
