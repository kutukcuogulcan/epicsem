// Single source of truth for "which tools exist and how are they grouped" — shared by
// Nav.tsx (marketing site's mega-menu), the homepage's own grid, and SidebarClient.tsx (the
// app-shell's left rail). Gruplar Arvow'un sol menüsüyle aynı mantıkta: İçerik / Yerel /
// Otorite / Analiz / Yönetim.
export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: string;
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "İçerik",
    items: [
      { href: "/editor", label: "Tüm Yazılar", icon: "editor" },
      { href: "/campaigns", label: "Autoblog", icon: "campaigns" },
      { href: "/knowledge", label: "Bilgi Bankası", icon: "knowledge" },
      { href: "/content", label: "Yayın Hedefleri", icon: "content" },
      { href: "/keywords", label: "Anahtar Kelime Planlayıcı", icon: "keywords" },
      { href: "/feeds", label: "Beslemeler", icon: "feeds" },
      { href: "/article-writer", label: "Sayfa Analizi", icon: "article" },
    ],
  },
  {
    title: "Yerel",
    items: [
      { href: "/local?tab=reviews", label: "Yorum Yanıtları", icon: "reviews" },
      { href: "/local", label: "GBP Gönderileri", icon: "local" },
      { href: "/backlinks?mode=citations", label: "İşletme Kayıtları", icon: "listing" },
    ],
  },
  {
    title: "Otorite",
    items: [
      { href: "/backlinks", label: "Backlinkler", icon: "backlinks" },
      { href: "/audit", label: "Site Optimizasyonu", icon: "audit" },
      { href: "/indexing", label: "URL İndeksleme", icon: "indexing", badge: "YENİ" },
      { href: "/bing", label: "Bing Webmaster", icon: "bing" },
    ],
  },
  {
    title: "Analiz",
    items: [
      { href: "/brand-monitors", label: "Marka Monitörleri", icon: "brandmon", badge: "YENİ" },
      { href: "/geo", label: "GEO Görünürlük", icon: "geo" },
      { href: "/gap", label: "Rakip Boşluğu", icon: "gap" },
      { href: "/rankings", label: "Sıralama Takibi", icon: "rankings" },
      { href: "/import", label: "Site Gezgini", icon: "import" },
      { href: "/monitor", label: "Sayfa İzleme", icon: "monitor" },
    ],
  },
  {
    title: "Yönetim",
    items: [
      { href: "/clients", label: "Müşteriler", icon: "clients" },
      { href: "/integrations", label: "Entegrasyonlar", icon: "integrations" },
      { href: "/prompts", label: "Claude Code Prompts", icon: "prompts" },
    ],
  },
];
