// robots.txt のパースと判定（§2-2）
//
// 外部ライブラリを使わず自前で書いているのは、依存を増やさないためと、
// 「どのルールで許可/拒否したか」を説明できる状態にしておきたいため。
// 判断に迷う場合は必ず「アクセスしない」側に倒す。

export interface RobotsRules {
  /** このUAに適用される Disallow パス */
  disallow: string[];
  allow: string[];
  crawlDelaySec: number | null;
}

const EMPTY_RULES: RobotsRules = { disallow: [], allow: [], crawlDelaySec: null };

/**
 * robots.txt をパースする。
 * User-agent: * のグループと、自分のUAに一致するグループを見る。
 * 自分のUA向けの指定があればそちらを優先する（robots.txtの通常の解釈）。
 */
export function parseRobots(text: string, userAgentToken: string): RobotsRules {
  const lines = text.split(/\r?\n/);

  const groups: { agents: string[]; rules: RobotsRules }[] = [];
  let current: { agents: string[]; rules: RobotsRules } | null = null;
  let lastWasAgent = false;

  for (const rawLine of lines) {
    const line = rawLine.split('#')[0]?.trim() ?? '';
    if (!line) continue;

    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: { disallow: [], allow: [], crawlDelaySec: null } };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }

    lastWasAgent = false;
    if (!current) continue;

    if (field === 'disallow') current.rules.disallow.push(value);
    else if (field === 'allow') current.rules.allow.push(value);
    else if (field === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n)) current.rules.crawlDelaySec = n;
    }
  }

  const uaLower = userAgentToken.toLowerCase();
  const specific = groups.find((g) => g.agents.some((a) => a !== '*' && uaLower.includes(a)));
  if (specific) return specific.rules;

  const wildcard = groups.find((g) => g.agents.includes('*'));
  return wildcard?.rules ?? EMPTY_RULES;
}

/**
 * パスがルール上アクセス可能か。
 * Allow と Disallow が両方マッチする場合は、より長い（具体的な）方が勝つ。
 */
export function isAllowed(rules: RobotsRules, path: string): boolean {
  const matchLength = (patterns: string[]): number => {
    let best = -1;
    for (const p of patterns) {
      if (p === '') continue; // "Disallow:" （空）は「制限なし」の意味
      if (matchesPattern(path, p) && p.length > best) best = p.length;
    }
    return best;
  };

  const disallowLen = matchLength(rules.disallow);
  if (disallowLen === -1) return true;

  const allowLen = matchLength(rules.allow);
  return allowLen >= disallowLen;
}

/** robots.txt のワイルドカード（* と 終端の $）に対応する */
function matchesPattern(path: string, pattern: string): boolean {
  if (!pattern.includes('*') && !pattern.endsWith('$')) {
    return path.startsWith(pattern);
  }
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const regex = escaped.endsWith('\\$')
    ? new RegExp(`^${escaped.slice(0, -2)}$`)
    : new RegExp(`^${escaped}`);
  return regex.test(path);
}
