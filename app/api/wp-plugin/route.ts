import { NextResponse } from "next/server";
import { WP_PLUGIN_PHP, zipFiles } from "@/lib/wp-connector-plugin";

/** GET /api/wp-plugin → epicsem-connector.zip (WordPress › Eklentiler › Yeni ekle › Eklenti yükle). */
export async function GET() {
  const zip = zipFiles([{ name: "epicsem-connector/epicsem-connector.php", data: Buffer.from(WP_PLUGIN_PHP, "utf8") }]);
  return new NextResponse(new Uint8Array(zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="epicsem-connector.zip"' },
  });
}
