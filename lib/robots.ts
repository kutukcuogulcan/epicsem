interface RobotsRule {
  userAgent: string;
  disallow: string[];
  allow: string[];
}

/** Minimal robots.txt parser — good enough for a root-level "is this bot blocked?" check. */
export function parseRobotsTxt(content: string): RobotsRule[] {
  const lines = content.split(/\r?\n/);
  const blocks: RobotsRule[] = [];
  let current: RobotsRule | null = null;

  for (const raw of lines) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      // A run of consecutive User-agent lines shares the rules that follow.
      if (!current || current.disallow.length || current.allow.length) {
        current = { userAgent: value.toLowerCase(), disallow: [], allow: [] };
        blocks.push(current);
      } else {
        // extend the previous block's applicability by pushing a linked entry
        blocks.push({ userAgent: value.toLowerCase(), disallow: current.disallow, allow: current.allow });
      }
    } else if (key === "disallow" && current) {
      if (value) current.disallow.push(value);
    } else if (key === "allow" && current) {
      if (value) current.allow.push(value);
    }
  }

  return blocks;
}

/** Returns true if the given bot user-agent is allowed to fetch path "/" (root-level check). */
export function isBotAllowed(blocks: RobotsRule[], botUserAgent: string, path = "/"): boolean {
  const ua = botUserAgent.toLowerCase();
  const specific = blocks.filter((b) => b.userAgent === ua);
  const wildcard = blocks.filter((b) => b.userAgent === "*");
  const applicable = specific.length > 0 ? specific : wildcard;

  if (applicable.length === 0) return true; // no rules = allowed by default

  for (const block of applicable) {
    const blockingRule = block.disallow.find((rule) => rule === "/" || (rule !== "" && path.startsWith(rule)));
    if (blockingRule) {
      // check for a more specific Allow overriding it
      const overriding = block.allow.find((rule) => rule.length > blockingRule.length && path.startsWith(rule));
      if (!overriding) return false;
    }
  }
  return true;
}
