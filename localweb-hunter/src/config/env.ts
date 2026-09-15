// 環境変数の読み取りを1箇所に集める。
// これ以外の場所で process.env を直接読まないこと。
// （どのキーがサーバー専用かを把握できなくなるため）

import 'server-only';

function str(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export type BusinessProviderName = 'mock' | 'osm' | 'dataforseo';
export type SearchProviderName = 'none' | 'dataforseo' | 'google' | 'brave';
export type AiProviderName = 'heuristic' | 'gemini' | 'openai' | 'anthropic';
export type StorageDriver = 'sqlite' | 'supabase';

function oneOf<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const v = str(key, fallback);
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/**
 * 保存先の選択。
 *
 * **supabase は未実装。** スキーマ（supabase/schema.sql）と型だけがあり、
 * リポジトリの実装は SQLite しかない。
 *
 * 黙って sqlite にフォールバックさせない。それをすると、
 * 「クラウドに保存しているつもりで、実際は手元のファイルに書いていた」という
 * 最悪の勘違いが起きる。設定した時点で落として気づかせる。
 */
function storageDriver(): StorageDriver {
  const v = str('STORAGE_DRIVER', 'sqlite');
  if (v === 'supabase') {
    throw new Error(
      'STORAGE_DRIVER=supabase はまだ実装されていません。' +
      'supabase/schema.sql と型定義はありますが、リポジトリの実装は SQLite のみです。' +
      'STORAGE_DRIVER を外すか sqlite にしてください。',
    );
  }
  if (v !== 'sqlite') {
    throw new Error(`STORAGE_DRIVER に不明な値が指定されています: ${v}（使えるのは sqlite のみ）`);
  }
  return 'sqlite';
}

export const env = {
  budget: {
    monthlyUsd: num('MONTHLY_BUDGET_USD', 5),
    perSearchUsd: num('PER_SEARCH_BUDGET_USD', 1),
  },
  businessProvider: oneOf<BusinessProviderName>(
    'BUSINESS_DATA_PROVIDER',
    ['mock', 'osm', 'dataforseo'],
    'mock'
  ),
  dataforseo: {
    login: str('DATAFORSEO_LOGIN', ''),
    password: str('DATAFORSEO_PASSWORD', ''),
    costPerRequest: num('DATAFORSEO_COST_PER_REQUEST', 0.012),
    costPerItem: num('DATAFORSEO_COST_PER_ITEM', 0.00036),
  },
  overpass: {
    endpoint: str('OVERPASS_ENDPOINT', 'https://overpass-api.de/api/interpreter'),
  },
  /**
   * モックプロバイダが配信する店舗サイトのURL。
   * これがあると Phase 2（サイト解析・メール抽出）をモックのまま実際に動かせる。
   *
   * ホスト名に localhost ではなく 127.0.0.1 を使っているのは意図的。
   * extractHostname() は「ドットを含まない文字列はホスト名として扱わない」ように
   * してあり（日本語の文が punycode のホスト名に化けるのを防ぐため）、
   * localhost はその判定に引っかかって公式サイトと認識されない。
   *
   * dev/start のポートを変えた場合はここも合わせること。
   */
  mockSiteBaseUrl: str('MOCK_SITE_BASE_URL', 'http://127.0.0.1:3000'),
  searchProvider: oneOf<SearchProviderName>(
    'SEARCH_PROVIDER',
    ['none', 'dataforseo', 'google', 'brave'],
    'none'
  ),
  dataforseoSerp: {
    // Live モードの単価。標準キューなら $0.0006 だが即時応答しない。
    costPerQuery: num('DATAFORSEO_SERP_COST_PER_QUERY', 0.002),
    locationName: str('DATAFORSEO_SERP_LOCATION', 'Japan'),
    languageCode: str('DATAFORSEO_SERP_LANGUAGE', 'ja'),
  },
  googleCse: {
    apiKey: str('GOOGLE_CSE_API_KEY', ''),
    cx: str('GOOGLE_CSE_CX', ''),
  },
  brave: {
    apiKey: str('BRAVE_SEARCH_API_KEY', ''),
  },
  aiProvider: oneOf<AiProviderName>(
    'AI_PROVIDER',
    ['heuristic', 'gemini', 'openai', 'anthropic'],
    'heuristic'
  ),
  gemini: {
    apiKey: str('GEMINI_API_KEY', ''),
    model: str('GEMINI_MODEL', 'gemini-2.0-flash'),
  },
  openai: {
    apiKey: str('OPENAI_API_KEY', ''),
    model: str('OPENAI_MODEL', 'gpt-4o-mini'),
  },
  anthropic: {
    apiKey: str('ANTHROPIC_API_KEY', ''),
    model: str('ANTHROPIC_MODEL', 'claude-sonnet-5'),
  },
  aiCostPerBusiness: num('AI_COST_PER_BUSINESS', 0.0005),
  crawler: {
    // 2秒未満には絶対にしない（§2-2）。設定で短くされても下限で丸める。
    minIntervalMs: Math.max(2000, num('CRAWLER_MIN_INTERVAL_MS', 2000)),
    timeoutMs: num('CRAWLER_TIMEOUT_MS', 10000),
    maxRetries: Math.min(2, num('CRAWLER_MAX_RETRIES', 2)),
    userAgent: str('CRAWLER_USER_AGENT', 'LocalWebHunter/0.2 (+https://example.com/about)'),
    maxPagesPerSite: num('CRAWLER_MAX_PAGES_PER_SITE', 5),
  },
  storage: {
    driver: storageDriver(),
    sqlitePath: str('SQLITE_PATH', './data/localweb-hunter.db'),
  },
  supabase: {
    url: str('SUPABASE_URL', ''),
    anonKey: str('SUPABASE_ANON_KEY', ''),
    serviceRoleKey: str('SUPABASE_SERVICE_ROLE_KEY', ''),
  },
  searchRateLimitPerHour: num('SEARCH_RATE_LIMIT_PER_HOUR', 20),
} as const;
