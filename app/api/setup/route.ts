import { NextRequest, NextResponse } from "next/server";

interface TelegramUpdate {
  message?: { chat: { id: number; first_name?: string } };
}

async function getChatIds(botToken: string): Promise<{ chat_id: number; name: string }[]> {
  const base = `https://api.telegram.org/bot${botToken}`;

  const webhookInfo = await fetch(`${base}/getWebhookInfo`).then((r) => r.json()) as {
    ok: boolean; result: { url: string };
  };
  const existingWebhook = webhookInfo.ok ? webhookInfo.result.url : "";

  await fetch(`${base}/deleteWebhook?drop_pending_updates=false`);

  const updatesRes = await fetch(`${base}/getUpdates?limit=50`).then((r) => r.json()) as {
    ok: boolean; result: TelegramUpdate[];
  };

  if (existingWebhook) {
    await fetch(`${base}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: existingWebhook }),
    });
  }

  if (!updatesRes.ok) return [];

  const chats = updatesRes.result
    .filter((u) => u.message?.chat)
    .map((u) => ({ chat_id: u.message!.chat.id, name: u.message!.chat.first_name ?? "unknown" }));

  return [...new Map(chats.map((c) => [c.chat_id, c])).values()];
}

export async function GET(req: NextRequest) {
  const expectedSecret = process.env.SETUP_SECRET ?? process.env.CRON_SECRET;
  if (!expectedSecret) {
    return NextResponse.json({ error: "Server misconfiguration: SETUP_SECRET not set" }, { status: 500 });
  }
  const provided = req.headers.get("x-setup-secret") ?? req.nextUrl.searchParams.get("secret");
  if (provided !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?bot=2 uses TELEGRAM_BOT_TOKEN_2, default uses TELEGRAM_BOT_TOKEN
  const botIndex = req.nextUrl.searchParams.get("bot") ?? "1";
  const tokenEnv = botIndex === "2" ? "TELEGRAM_BOT_TOKEN_2" : "TELEGRAM_BOT_TOKEN";
  const chatEnv = botIndex === "2" ? "TELEGRAM_CHAT_ID_2" : "TELEGRAM_CHAT_ID";
  const botToken = process.env[tokenEnv];

  if (!botToken) {
    return NextResponse.json({ error: `${tokenEnv} is not set` }, { status: 500 });
  }

  const chats = await getChatIds(botToken);

  if (chats.length === 0) {
    return NextResponse.json({
      instruction: `Bot ile henüz hiç mesajlaşılmamış. Bota /start gönderin ve tekrar deneyin.`,
      env_to_set: chatEnv,
    });
  }

  return NextResponse.json({
    instruction: `Aşağıdaki chat_id'yi ${chatEnv} env değişkeni olarak ekleyin`,
    chats,
    env_to_set: chatEnv,
  });
}
