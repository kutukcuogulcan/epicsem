/** Sunucu açılışında Entegrasyonlar'dan girilen AI anahtarlarını yükler. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (!process.env.DATABASE_URL) return;
    try {
      const { applyAiKeys } = await import("./lib/ai-keys");
      await applyAiKeys();
    } catch (e) {
      console.error("[instrumentation] AI anahtarları yüklenemedi:", e);
    }
  }
}
