/**
 * "Epicsem Connector" WordPress eklentisi — Site Taraması'ndaki "WordPress'e uygula" için.
 * WordPress çekirdeği REST üzerinden SEO title / meta açıklama / schema yazmaya izin vermez;
 * bu eklenti üç meta alanını REST'e açar ve sayfada kullanır:
 *   epicsem_title     → <title> (Yoast / Rank Math varsa onların filtresiyle, yoksa çekirdekle)
 *   epicsem_metadesc  → <meta name="description"> (Yoast / Rank Math filtresi ya da doğrudan)
 *   epicsem_schema    → <script type="application/ld+json"> wp_head'e
 *   epicsem_ogimage   → og:image / twitter:image (Yoast / Rank Math filtresiyle, yoksa doğrudan)
 * Görsel alt metni için eklenti gerekmez (çekirdek REST'te alt_text yazılabilir).
 *
 * 1.2.0: IndexNow — eklenti kendi anahtarını üretir, /<anahtar>.txt dosyasını sunar ve
 * yayınlanan/güncellenen her içeriği Bing, Yandex vb. arama motorlarına otomatik bildirir.
 */
export const WP_PLUGIN_VERSION = "1.2.0";

export const WP_PLUGIN_PHP = `<?php
/**
 * Plugin Name: Epicsem Connector
 * Description: Epicsem Site Taraması'ndan gelen SEO title, meta açıklama, schema ve paylaşım görseli düzeltmelerini uygular; yeni içerikleri IndexNow ile arama motorlarına bildirir.
 * Version: ${WP_PLUGIN_VERSION}
 * Author: Epicsem
 * License: GPL2
 */
if (!defined('ABSPATH')) exit;

add_action('init', function () {
  $types = get_post_types(['public' => true]);
  foreach ($types as $t) {
    foreach (['epicsem_title', 'epicsem_metadesc', 'epicsem_schema', 'epicsem_ogimage'] as $key) {
      register_post_meta($t, $key, [
        'type' => 'string',
        'single' => true,
        'show_in_rest' => true,
        'auth_callback' => function () { return current_user_can('edit_posts'); },
      ]);
    }
  }
});

add_action('rest_api_init', function () {
  register_rest_route('epicsem/v1', '/ping', [
    'methods' => 'GET',
    'permission_callback' => '__return_true',
    'callback' => function () { return ['ok' => true, 'version' => '${WP_PLUGIN_VERSION}', 'indexnow' => true]; },
  ]);
  register_rest_route('epicsem/v1', '/indexnow', [
    'methods' => 'GET',
    'permission_callback' => function () { return current_user_can('edit_posts'); },
    'callback' => function () { return ['key' => epicsem_indexnow_key(), 'keyLocation' => home_url('/' . epicsem_indexnow_key() . '.txt')]; },
  ]);
});

/* ---- IndexNow ---- */
function epicsem_indexnow_key() {
  $k = get_option('epicsem_indexnow_key');
  if (!$k) {
    $k = strtolower(wp_generate_password(32, false, false));
    update_option('epicsem_indexnow_key', $k, false);
  }
  return $k;
}
add_action('init', function () {
  $path = trim((string) parse_url(isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '', PHP_URL_PATH), '/');
  $home = trim((string) parse_url(home_url('/'), PHP_URL_PATH), '/');
  if ($home !== '' && strpos($path, $home . '/') === 0) $path = substr($path, strlen($home) + 1);
  if ($path === epicsem_indexnow_key() . '.txt') {
    header('Content-Type: text/plain; charset=utf-8');
    echo epicsem_indexnow_key();
    exit;
  }
}, 0);
add_action('transition_post_status', function ($new, $old, $post) {
  if ($new !== 'publish' || wp_is_post_revision($post) || wp_is_post_autosave($post)) return;
  if (!is_post_type_viewable($post->post_type)) return;
  $url = get_permalink($post);
  if (!$url) return;
  $host = parse_url(home_url('/'), PHP_URL_HOST);
  wp_remote_post('https://api.indexnow.org/indexnow', [
    'blocking' => false,
    'timeout' => 5,
    'headers' => ['Content-Type' => 'application/json; charset=utf-8'],
    'body' => wp_json_encode(['host' => $host, 'key' => epicsem_indexnow_key(), 'keyLocation' => home_url('/' . epicsem_indexnow_key() . '.txt'), 'urlList' => [$url]]),
  ]);
}, 10, 3);

function epicsem_meta($key) {
  if (!is_singular()) return '';
  $v = get_post_meta(get_queried_object_id(), $key, true);
  return is_string($v) ? trim($v) : '';
}

/* ---- Title ---- */
add_filter('pre_get_document_title', function ($t) { $v = epicsem_meta('epicsem_title'); return $v !== '' ? $v : $t; }, 99);
add_filter('wpseo_title', function ($t) { $v = epicsem_meta('epicsem_title'); return $v !== '' ? $v : $t; }, 99);
add_filter('rank_math/frontend/title', function ($t) { $v = epicsem_meta('epicsem_title'); return $v !== '' ? $v : $t; }, 99);

/* ---- Meta description ---- */
add_filter('wpseo_metadesc', function ($d) { $v = epicsem_meta('epicsem_metadesc'); return $v !== '' ? $v : $d; }, 99);
add_filter('rank_math/frontend/description', function ($d) { $v = epicsem_meta('epicsem_metadesc'); return $v !== '' ? $v : $d; }, 99);
add_action('wp_head', function () {
  if (defined('WPSEO_VERSION') || defined('RANK_MATH_VERSION')) return; // onlar zaten basıyor
  $v = epicsem_meta('epicsem_metadesc');
  if ($v !== '') echo '<meta name="description" content="' . esc_attr($v) . '" />' . "\\n";
}, 1);

/* ---- Paylaşım görseli (og:image) ---- */
add_filter('wpseo_opengraph_image', function ($i) { $v = epicsem_meta('epicsem_ogimage'); return $v !== '' ? $v : $i; }, 99);
add_filter('rank_math/opengraph/facebook/image', function ($i) { $v = epicsem_meta('epicsem_ogimage'); return $v !== '' ? $v : $i; }, 99);
add_action('wp_head', function () {
  if (defined('WPSEO_VERSION') || defined('RANK_MATH_VERSION')) return;
  $v = epicsem_meta('epicsem_ogimage');
  if ($v === '') return;
  echo '<meta property="og:image" content="' . esc_url($v) . '" />' . "\n";
  echo '<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />' . "\n";
  echo '<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:image" content="' . esc_url($v) . '" />' . "\n";
}, 5);

/* ---- Schema (JSON-LD) ---- */
add_action('wp_head', function () {
  $v = epicsem_meta('epicsem_schema');
  if ($v === '') return;
  $decoded = json_decode($v);
  if ($decoded === null) return; // geçersiz JSON basılmaz
  echo '<script type="application/ld+json">' . wp_json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . '</script>' . "\\n";
}, 20);
`;

/* ---- Bağımlılıksız ZIP (sıkıştırmasız, "store") ---- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipFiles(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const crc = crc32(f.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6); // UTF-8 adlar
    lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(0, 10);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(f.data.length, 18);
    lh.writeUInt32LE(f.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, name, f.data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt32LE(0, 12);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(f.data.length, 20);
    ch.writeUInt32LE(f.data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += lh.length + name.length + f.data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
