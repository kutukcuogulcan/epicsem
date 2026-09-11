// Single source of truth for "which tools exist and how are they grouped" — shared by
// Nav.tsx (marketing site's mega-menu), the homepage's own grid, and Sidebar.tsx (the
// app-shell's left rail), so adding a tool only means editing this one list instead of
// three places quietly drifting apart. Mirrors the "Tek panel, üç iş" story: Analiz &
// Test (run a test) / Otomasyon (set-and-forget) / Yönetim (accounts, not tools).
export const NAV_GROUPS = [
  {
    title: "Analiz & Test",
    items: [
      { href: "/audit", label: "SEO + AXO Audit", icon: "audit" },
      { href: "/geo", label: "GEO/AEO Visibility", icon: "geo" },
      { href: "/gap", label: "Gap Analysis", icon: "gap" },
      { href: "/article-writer", label: "Article Writer", icon: "article" },
    ],
  },
  {
    title: "Otomasyon",
    items: [
      { href: "/monitor", label: "AXO Monitoring", icon: "monitor" },
      { href: "/campaigns", label: "Kampanyalar", icon: "campaigns" },
      { href: "/import", label: "Bulk Import", icon: "import" },
      { href: "/content", label: "Content Studio", icon: "content" },
      { href: "/local", label: "Yerel İşletme (GBP)", icon: "local" },
    ],
  },
  {
    title: "Yönetim",
    items: [
      { href: "/clients", label: "Clients", icon: "clients" },
      { href: "/prompts", label: "Claude Code Prompts", icon: "prompts" },
    ],
  },
];
