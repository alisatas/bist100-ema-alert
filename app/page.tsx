export default function Home() {
  const nextRun = "Her Hafta İçi 11:00 TST";

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-mono flex items-center justify-center p-8">
      <div className="max-w-lg w-full space-y-6">
        <div className="border border-zinc-800 rounded-xl p-6 space-y-3">
          <h1 className="text-xl font-bold text-white">
            📊 BIST 100 EMA 200 Alert
          </h1>
          <p className="text-zinc-400 text-sm">
            Her hafta içi sabah 11:00&apos;de BIST 100 hisselerini tarar.
            EMA 200&apos;e ±%2 yaklaşan hisseler Telegram&apos;a bildirilir.
          </p>
        </div>

        <div className="border border-zinc-800 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            Durum
          </h2>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 text-sm font-medium">Aktif</span>
          </div>
          <div className="text-sm text-zinc-400">
            Sonraki tarama: <span className="text-white">{nextRun}</span>
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
              <code className="text-zinc-200 bg-zinc-800 px-1 rounded">/api/setup</code>{" "}
              adresini ziyaret edin → chat_id&apos;nizi alın
            </li>
            <li>
              <code className="text-zinc-200 bg-zinc-800 px-1 rounded">TELEGRAM_CHAT_ID</code>{" "}
              env değişkenini Vercel&apos;e ekleyin
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
