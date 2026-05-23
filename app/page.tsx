export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white font-mono flex items-center justify-center p-8">
      <div className="max-w-lg w-full space-y-6">
        <div className="border border-zinc-800 rounded-xl p-6 space-y-3">
          <h1 className="text-xl font-bold text-white">
            📊 BIST 100 Finans Asistanı
          </h1>
          <p className="text-zinc-400 text-sm">
            Her hafta içi sabah Telegram&apos;a otomatik bülten gönderir.
          </p>
        </div>

        <div className="border border-zinc-800 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            Günlük Program
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <span className="text-blue-400 font-bold w-12 shrink-0">10:00</span>
              <div>
                <div className="text-white font-medium">🌅 Sabah Brifing + EMA 200 Taraması</div>
                <div className="text-zinc-500 text-xs mt-0.5">Makro veriler (USD/TRY, Altın, Brent, BIST100, S&P) + EMA 200&apos;e ±%2 yaklaşan hisseler</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-purple-400 font-bold w-12 shrink-0">10:30</span>
              <div>
                <div className="text-white font-medium">📰 Sabah Haber Bülteni</div>
                <div className="text-zinc-500 text-xs mt-0.5">Bloomberg HT, Dünya, AA, Hürriyet, Sabah, Habertürk ve diğerlerinden en önemli 3-4 haber (AI analizi)</div>
              </div>
            </div>
          </div>
        </div>

        <div className="border border-zinc-800 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            Durum
          </h2>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 text-sm font-medium">Aktif — Hafta içi her gün</span>
          </div>
        </div>

        <div className="border border-zinc-800 rounded-xl p-6 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            Kurulum
          </h2>
          <ol className="text-sm text-zinc-400 space-y-2 list-decimal list-inside">
            <li>
              Telegram botunuza{" "}
              <code className="text-zinc-200 bg-zinc-800 px-1 rounded">/start</code>{" "}
              gönderin
            </li>
            <li>
              <code className="text-zinc-200 bg-zinc-800 px-1 rounded">/api/setup?secret=SETUP_SECRET</code>{" "}
              adresini ziyaret edin → chat_id&apos;nizi alın
            </li>
            <li>
              <code className="text-zinc-200 bg-zinc-800 px-1 rounded">TELEGRAM_CHAT_ID</code>,{" "}
              <code className="text-zinc-200 bg-zinc-800 px-1 rounded">CRON_SECRET</code>,{" "}
              <code className="text-zinc-200 bg-zinc-800 px-1 rounded">ANTHROPIC_API_KEY</code>{" "}
              env değişkenlerini Vercel&apos;e ekleyin
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
