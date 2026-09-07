// 店舗サイトへのHTTPアクセス（§2-2）
//
// 守る約束：
//   * robots.txt を取得して確認し、Disallow されたパスにはアクセスしない
//   * 同一ドメインへのリクエスト間隔は最低2秒
//   * User-Agent に識別子と連絡先URLを含める
//   * タイムアウト10秒、リトライ最大2回（exponential backoff）
//
// 「相手のサーバーに迷惑をかけない」ことを、設定で緩められない形で実装している。
// minIntervalMs は env 側で 2000 未満に下がらないよう下限を掛けてある。

import 'server-only';
import { isAllowed, parseRobots, type RobotsRules } from './robots';

export interface CrawlerConfig {
  userAgent: string;
  minIntervalMs: number;
  timeoutMs: number;
  maxRetries: number;
}

export interface FetchResult {
  ok: boolean;
  status: number;
  url: string;
  finalUrl: string;
  html: string | null;
  responseTimeMs: number;
  error: string | null;
  /** robots.txt で拒否された場合 true。エラーとは区別する */
  blockedByRobots: boolean;
}

export class PoliteHttpClient {
  private lastRequestByHost = new Map<string, number>();
  private robotsCache = new Map<string, RobotsRules | null>();

  constructor(private readonly config: CrawlerConfig) {}

  /** 同一ホストへの連投を防ぐ。robots.txt の Crawl-delay がより長ければそちらに従う */
  private async waitForHost(host: string, crawlDelaySec: number | null): Promise<void> {
    const interval = Math.max(this.config.minIntervalMs, (crawlDelaySec ?? 0) * 1000);
    const last = this.lastRequestByHost.get(host);
    if (last !== undefined) {
      const wait = interval - (Date.now() - last);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    this.lastRequestByHost.set(host, Date.now());
  }

  private async getRobots(origin: string): Promise<RobotsRules | null> {
    const cached = this.robotsCache.get(origin);
    if (cached !== undefined) return cached;

    let rules: RobotsRules | null = null;
    try {
      const host = new URL(origin).hostname;
      await this.waitForHost(host, null);

      const res = await fetch(`${origin}/robots.txt`, {
        headers: { 'User-Agent': this.config.userAgent },
        signal: AbortSignal.timeout(this.config.timeoutMs),
        redirect: 'follow',
      });

      if (res.ok) {
        rules = parseRobots(await res.text(), this.config.userAgent);
      } else if (res.status === 404 || res.status === 410) {
        // robots.txt が無い = 制限なし、という一般的な解釈
        rules = { disallow: [], allow: [], crawlDelaySec: null };
      } else {
        // 5xx 等で取得できない場合は「分からない」ので、安全側（アクセスしない）に倒す
        rules = null;
      }
    } catch {
      rules = null;
    }

    this.robotsCache.set(origin, rules);
    return rules;
  }

  async fetchPage(url: string): Promise<FetchResult> {
    const base: Omit<FetchResult, 'ok' | 'status' | 'html' | 'error' | 'blockedByRobots'> = {
      url,
      finalUrl: url,
      responseTimeMs: 0,
    };

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ...base, ok: false, status: 0, html: null, error: 'URLの形式が不正です', blockedByRobots: false };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ...base, ok: false, status: 0, html: null, error: 'http/https以外のURLは取得しません', blockedByRobots: false };
    }

    const rules = await this.getRobots(parsed.origin);
    if (rules === null) {
      return {
        ...base, ok: false, status: 0, html: null,
        error: 'robots.txt を確認できなかったため、アクセスを見送りました',
        blockedByRobots: true,
      };
    }
    if (!isAllowed(rules, parsed.pathname)) {
      return {
        ...base, ok: false, status: 0, html: null,
        error: 'robots.txt で許可されていないパスのためアクセスしませんでした',
        blockedByRobots: true,
      };
    }

    let lastError = '';
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (attempt > 0) {
        // exponential backoff: 1s, 2s
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
      }
      await this.waitForHost(parsed.hostname, rules.crawlDelaySec);

      const startedAt = Date.now();
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': this.config.userAgent,
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'ja,en;q=0.8',
          },
          signal: AbortSignal.timeout(this.config.timeoutMs),
          redirect: 'follow',
        });
        const responseTimeMs = Date.now() - startedAt;

        // 4xx はリトライしても結果が変わらないので即返す
        if (!res.ok && res.status < 500) {
          return {
            ...base, ok: false, status: res.status, finalUrl: res.url || url, html: null,
            responseTimeMs, error: `HTTP ${res.status}`, blockedByRobots: false,
          };
        }
        if (!res.ok) {
          lastError = `HTTP ${res.status}`;
          continue;
        }

        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('html')) {
          return {
            ...base, ok: false, status: res.status, finalUrl: res.url || url, html: null,
            responseTimeMs, error: `HTML以外のコンテンツ（${contentType}）`, blockedByRobots: false,
          };
        }

        return {
          ...base, ok: true, status: res.status, finalUrl: res.url || url,
          html: await res.text(), responseTimeMs, error: null, blockedByRobots: false,
        };
      } catch (e) {
        lastError = e instanceof Error ? e.message : '不明なエラー';
      }
    }

    return { ...base, ok: false, status: 0, html: null, error: lastError, blockedByRobots: false };
  }
}
