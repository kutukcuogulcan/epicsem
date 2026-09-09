// Shared set of thin outline icons for each tool — used by both the nav's
// "Ürünler" mega-menu and the /features/* landing pages, so the same tool
// always gets the same icon everywhere instead of two different visual
// languages for the same product. Mirrors arvow.com's icon-tile treatment:
// flat outline glyphs on a plain rounded-square tile, no per-item color.
export function ToolIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export const TOOL_ICONS: Record<string, React.ReactNode> = {
  audit: (
    <ToolIcon>
      <rect x="4" y="2.5" width="10" height="13" rx="1.5" />
      <path d="M7 2.5V2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v.5" />
      <path d="M6.5 9.5l1.5 1.5 3.5-3.5" />
    </ToolIcon>
  ),
  geo: (
    <ToolIcon>
      <circle cx="9" cy="9" r="6.5" />
      <path d="M2.5 9h13" />
      <path d="M9 2.5c1.8 1.9 2.8 4.1 2.8 6.5S10.8 13.6 9 15.5C7.2 13.6 6.2 11.4 6.2 9S7.2 4.4 9 2.5z" />
    </ToolIcon>
  ),
  gap: (
    <ToolIcon>
      <circle cx="6.5" cy="9" r="4.5" />
      <circle cx="11.5" cy="9" r="4.5" />
    </ToolIcon>
  ),
  monitor: (
    <ToolIcon>
      <path d="M2 9.5h3l1.5-4L9 13l1.5-7 1.2 3.5H16" />
    </ToolIcon>
  ),
  import: (
    <ToolIcon>
      <path d="M9 2.5v8.5" />
      <path d="M5.5 7.5L9 11l3.5-3.5" />
      <path d="M2.5 13v1.5A1.5 1.5 0 0 0 4 16h10a1.5 1.5 0 0 0 1.5-1.5V13" />
    </ToolIcon>
  ),
  content: (
    <ToolIcon>
      <path d="M11.5 2.5l4 4L6 16l-4.3.8L2.5 12.5z" />
      <path d="M10 4l4 4" />
    </ToolIcon>
  ),
  local: (
    <ToolIcon>
      <path d="M9 16s5.5-4.9 5.5-9A5.5 5.5 0 0 0 3.5 7c0 4.1 5.5 9 5.5 9z" />
      <circle cx="9" cy="7" r="2" />
    </ToolIcon>
  ),
  clients: (
    <ToolIcon>
      <circle cx="6.5" cy="6.5" r="2.5" />
      <path d="M1.8 15c.6-2.6 2.5-4 4.7-4s4.1 1.4 4.7 4" />
      <circle cx="12.7" cy="6.8" r="2" />
      <path d="M12 11.3c1.8.2 3.2 1.5 3.7 3.7" />
    </ToolIcon>
  ),
  prompts: (
    <ToolIcon>
      <rect x="2" y="3" width="14" height="12" rx="1.5" />
      <path d="M5 7l2.5 2L5 11" />
      <path d="M9.5 11h3.5" />
    </ToolIcon>
  ),
  check: (
    <ToolIcon>
      <path d="M3.5 9.5l3.5 3.5 7.5-7.5" />
    </ToolIcon>
  ),
};
