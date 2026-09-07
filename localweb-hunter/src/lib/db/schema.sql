-- LocalWeb Hunter — ローカルSQLiteスキーマ
-- Supabase(PostgreSQL)版は supabase/schema.sql にあり、内容を対応させてある。
--
-- 設計上の重要点：
--   * 実データとAI推定値を別カラムに分けている（businesses.sales_analysis_json が推定値の隔離先）
--   * 電話・メールは値そのものと出所(*_source, *_source_url)を必ずセットで持つ
--   * business_history にスコアの内訳をスナップショットとして残す（後付け検証のため）

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- businesses: 店舗マスタ
-- ============================================================
CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_business_id TEXT NOT NULL,

  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  prefecture TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  latitude REAL,
  longitude REAL,

  -- 連絡先：値と出所を必ずセットで保存する。推測生成は禁止（§2-3）
  phone TEXT,
  phone_source TEXT,
  phone_source_url TEXT,
  phone_verified INTEGER NOT NULL DEFAULT 0,
  phone_observed_at TEXT,

  email TEXT,
  email_source TEXT,
  email_source_url TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  email_observed_at TEXT,

  rating REAL,
  rating_source TEXT,
  rating_observed_at TEXT,
  review_count INTEGER,
  review_count_source TEXT,
  review_count_observed_at TEXT,

  website_url TEXT,
  website_status TEXT NOT NULL DEFAULT 'unknown',
  web_presence_score INTEGER NOT NULL DEFAULT 0,
  website_opportunity_score INTEGER,
  website_signals_json TEXT,
  candidate_urls_json TEXT NOT NULL DEFAULT '[]',
  social_urls_json TEXT NOT NULL DEFAULT '[]',
  google_maps_url TEXT,
  opening_hours TEXT,

  lead_score INTEGER NOT NULL DEFAULT 0,
  lead_score_breakdown_json TEXT,
  sales_priority TEXT NOT NULL DEFAULT 'D',

  -- AI推定値の隔離先。中身は SalesAnalysis 型で、valueType='AI_ESTIMATE' 相当の扱い
  sales_analysis_json TEXT,

  regulatory_notes_json TEXT NOT NULL DEFAULT '[]',

  lead_status TEXT NOT NULL DEFAULT '未接触',
  next_action TEXT,
  last_contacted_at TEXT,
  next_contact_at TEXT,
  sales_notes TEXT,
  deal_value REAL,

  phase2_completed_at TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE (source, source_business_id)
);

CREATE INDEX IF NOT EXISTS idx_businesses_city ON businesses(city);
CREATE INDEX IF NOT EXISTS idx_businesses_category ON businesses(category);
CREATE INDEX IF NOT EXISTS idx_businesses_lead_score ON businesses(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_businesses_priority ON businesses(sales_priority);
CREATE INDEX IF NOT EXISTS idx_businesses_website_status ON businesses(website_status);
CREATE INDEX IF NOT EXISTS idx_businesses_lead_status ON businesses(lead_status);
CREATE INDEX IF NOT EXISTS idx_businesses_phone ON businesses(phone);
CREATE INDEX IF NOT EXISTS idx_businesses_location ON businesses(latitude, longitude);

-- ============================================================
-- business_history: 変化履歴 + スコアのスナップショット（§10-3）
-- lead_score_breakdown_json を残すことで「高スコアの店は実際に成約したか」を
-- 後から検証できる。これがないと §13 の指標が測定不能になる。
-- ============================================================
CREATE TABLE IF NOT EXISTS business_history (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  event TEXT NOT NULL,              -- 'created' / 'rating_changed' / 'website_changed' / 'score_snapshot' / 'status_changed'
  rating REAL,
  review_count INTEGER,
  website_status TEXT,
  lead_score INTEGER,
  lead_score_breakdown_json TEXT,
  lead_status TEXT,
  note TEXT,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_business ON business_history(business_id, recorded_at DESC);

-- ============================================================
-- search_jobs / search_subqueries: レジューム可能な調査ジョブ（§12-2）
-- ============================================================
CREATE TABLE IF NOT EXISTS search_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  criteria_json TEXT NOT NULL,
  total_subqueries INTEGER NOT NULL DEFAULT 0,
  completed_subqueries INTEGER NOT NULL DEFAULT 0,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  qualified_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON search_jobs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS search_subqueries (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES search_jobs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  label TEXT NOT NULL,
  params_json TEXT NOT NULL,
  cursor TEXT,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE (job_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_subqueries_job ON search_subqueries(job_id, seq);

-- ============================================================
-- search_logs: 検索実行ログ
-- ============================================================
CREATE TABLE IF NOT EXISTS search_logs (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  searched_at TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  criteria_json TEXT NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  qualified_count INTEGER NOT NULL DEFAULT 0,
  new_business_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  api_request_count INTEGER NOT NULL DEFAULT 0,
  api_item_count INTEGER NOT NULL DEFAULT 0,
  api_cost_usd REAL NOT NULL DEFAULT 0,
  web_search_cost_usd REAL NOT NULL DEFAULT 0,
  ai_cost_usd REAL NOT NULL DEFAULT 0,
  total_cost_usd REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_search_logs_at ON search_logs(searched_at DESC);

-- ============================================================
-- api_usage: 予算ガードの根拠となる実使用量（§2-1）
-- 外部APIを叩いた事実はすべてここに1行入る。ここに入らない呼び出しがあれば設計ミス。
-- ============================================================
CREATE TABLE IF NOT EXISTS api_usage (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  kind TEXT NOT NULL,               -- business_data / web_search / ai / crawler
  provider TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  job_id TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_usage_at ON api_usage(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_kind ON api_usage(kind, occurred_at DESC);

-- ============================================================
-- lead_score_weights: スコア重み（§8-1 「ハードコードしない」）
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_score_weights (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'default',
  rating_weight REAL NOT NULL DEFAULT 15,
  review_count_weight REAL NOT NULL DEFAULT 15,
  no_website_weight REAL NOT NULL DEFAULT 25,
  has_sns_weight REAL NOT NULL DEFAULT 10,
  has_phone_weight REAL NOT NULL DEFAULT 10,
  local_density_weight REAL NOT NULL DEFAULT 5,
  foot_traffic_weight REAL NOT NULL DEFAULT 10,
  web_improvement_weight REAL NOT NULL DEFAULT 10,
  threshold_s REAL NOT NULL DEFAULT 85,
  threshold_a REAL NOT NULL DEFAULT 70,
  threshold_b REAL NOT NULL DEFAULT 55,
  threshold_c REAL NOT NULL DEFAULT 40,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
