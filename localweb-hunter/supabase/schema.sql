-- LocalWeb Hunter — Supabase (PostgreSQL) スキーマ
--
-- ローカル実行では src/lib/db/schema.sql（SQLite）を使う。こちらは
-- 「複数人で使う」「どこからでも見たい」となったときに切り替えるためのもの。
-- テーブル構成は SQLite 版と対応させてある。
--
-- 使い方: Supabase の SQL Editor でこのファイルを実行し、
--         .env.local の STORAGE_DRIVER=supabase と SUPABASE_* を設定する。
--         （Repository の Supabase 実装は未作成。切り替える際に追加すること）

create extension if not exists "pgcrypto";

-- ============================================================
-- businesses: 店舗マスタ
-- 連絡先は値と出所をセットで持つ。出所不明の値は保存しない。
-- ============================================================
create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  -- 複数人で使う場合に備えた所有者。単一利用なら null のままでよい
  owner_id uuid references auth.users(id) on delete cascade,

  source text not null,
  source_business_id text not null,

  name text not null,
  category text not null default '',
  address text not null default '',
  prefecture text not null default '',
  city text not null default '',
  latitude double precision,
  longitude double precision,

  phone text,
  -- normalizePhone() を通した値。重複排除の照合はこちらで行う
  phone_normalized text,
  phone_source text,
  phone_source_url text,
  phone_verified boolean not null default false,
  phone_observed_at timestamptz,

  email text,
  email_source text,
  email_source_url text,
  email_verified boolean not null default false,
  email_observed_at timestamptz,

  rating numeric,
  rating_source text,
  rating_observed_at timestamptz,
  review_count integer,
  review_count_source text,
  review_count_observed_at timestamptz,

  website_url text,
  website_status text not null default 'unknown',
  web_presence_score integer not null default 0,
  website_opportunity_score integer,
  website_signals_json jsonb,
  candidate_urls_json jsonb not null default '[]'::jsonb,
  social_urls_json jsonb not null default '[]'::jsonb,
  google_maps_url text,
  opening_hours text,

  lead_score integer not null default 0,
  lead_score_breakdown_json jsonb,
  sales_priority text not null default 'D',

  -- AI推定値の隔離先。実データと同じカラムに混ぜない
  sales_analysis_json jsonb,

  regulatory_notes_json jsonb not null default '[]'::jsonb,

  lead_status text not null default '未接触',
  next_action text,
  last_contacted_at timestamptz,
  next_contact_at timestamptz,
  sales_notes text,
  deal_value numeric,

  phase2_completed_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source, source_business_id)
);

create index if not exists idx_businesses_city on businesses(city);
create index if not exists idx_businesses_category on businesses(category);
create index if not exists idx_businesses_lead_score on businesses(lead_score desc nulls last);
create index if not exists idx_businesses_priority on businesses(sales_priority);
create index if not exists idx_businesses_website_status on businesses(website_status);
create index if not exists idx_businesses_lead_status on businesses(lead_status);
create index if not exists idx_businesses_phone on businesses(phone_normalized);
create index if not exists idx_businesses_location on businesses(latitude, longitude);
create index if not exists idx_businesses_owner on businesses(owner_id);
create index if not exists idx_businesses_phase2 on businesses(phase2_completed_at, lead_score desc);

-- ============================================================
-- business_history: 変化履歴 + スコアのスナップショット
-- lead_score_breakdown_json を残すことで、
-- 「スコアが高い店は実際に成約したのか」を後から検証できる。
-- ============================================================
create table if not exists business_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  event text not null,
  rating numeric,
  review_count integer,
  website_status text,
  lead_score integer,
  lead_score_breakdown_json jsonb,
  lead_status text,
  note text,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_history_business on business_history(business_id, recorded_at desc);

-- ============================================================
-- search_jobs / search_subqueries: レジューム可能な調査ジョブ
-- ============================================================
create table if not exists search_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  status text not null,
  criteria_json jsonb not null,
  total_subqueries integer not null default 0,
  completed_subqueries integer not null default 0,
  fetched_count integer not null default 0,
  qualified_count integer not null default 0,
  new_count integer not null default 0,
  duplicate_count integer not null default 0,
  cost_usd numeric not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_jobs_status on search_jobs(status, created_at desc);

create table if not exists search_subqueries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references search_jobs(id) on delete cascade,
  seq integer not null,
  status text not null default 'pending',
  label text not null,
  params_json jsonb not null,
  cursor text,
  fetched_count integer not null default 0,
  cost_usd numeric not null default 0,
  error_message text,
  attempts integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (job_id, seq)
);

create index if not exists idx_subqueries_job on search_subqueries(job_id, seq);

-- ============================================================
-- search_logs
-- ============================================================
create table if not exists search_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  job_id uuid,
  searched_at timestamptz not null default now(),
  region text not null default '',
  category text not null default '',
  criteria_json jsonb not null,
  result_count integer not null default 0,
  qualified_count integer not null default 0,
  new_business_count integer not null default 0,
  duplicate_count integer not null default 0,
  api_request_count integer not null default 0,
  api_item_count integer not null default 0,
  api_cost_usd numeric not null default 0,
  web_search_cost_usd numeric not null default 0,
  ai_cost_usd numeric not null default 0,
  total_cost_usd numeric not null default 0
);

create index if not exists idx_search_logs_at on search_logs(searched_at desc);

-- ============================================================
-- api_usage: 予算ガードの根拠となる実使用量
-- 外部APIを叩いた事実はすべてここに1行入る。
-- ============================================================
create table if not exists api_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  kind text not null,
  provider text not null,
  request_count integer not null default 0,
  item_count integer not null default 0,
  cost_usd numeric not null default 0,
  job_id uuid,
  note text
);

create index if not exists idx_api_usage_at on api_usage(occurred_at desc);
create index if not exists idx_api_usage_kind on api_usage(kind, occurred_at desc);

-- ============================================================
-- lead_score_weights: スコア重みと優先度閾値
-- ============================================================
create table if not exists lead_score_weights (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null default 'default',
  rating_weight numeric not null default 15,
  review_count_weight numeric not null default 15,
  no_website_weight numeric not null default 25,
  has_sns_weight numeric not null default 10,
  has_phone_weight numeric not null default 10,
  local_density_weight numeric not null default 5,
  foot_traffic_weight numeric not null default 10,
  web_improvement_weight numeric not null default 10,
  threshold_s numeric not null default 85,
  threshold_a numeric not null default 70,
  threshold_b numeric not null default 55,
  threshold_c numeric not null default 40,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- updated_at の自動更新
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_businesses_updated_at on businesses;
create trigger trg_businesses_updated_at
  before update on businesses
  for each row execute function set_updated_at();

-- ============================================================
-- Row Level Security
--
-- 複数人で使う場合に有効化する。単一利用なら不要だが、
-- Supabase は anon key がクライアントに露出するため、
-- ネットワーク越しに使うなら必ず有効にすること。
--
-- 有効化する前に、既存行の owner_id を埋めておくこと
-- （owner_id が null の行はどのポリシーにも一致せず、見えなくなる）。
-- ============================================================
alter table businesses          enable row level security;
alter table business_history    enable row level security;
alter table search_jobs         enable row level security;
alter table search_subqueries   enable row level security;
alter table search_logs         enable row level security;
alter table api_usage           enable row level security;
alter table lead_score_weights  enable row level security;

drop policy if exists own_businesses on businesses;
create policy own_businesses on businesses
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists own_search_jobs on search_jobs;
create policy own_search_jobs on search_jobs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists own_search_logs on search_logs;
create policy own_search_logs on search_logs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists own_api_usage on api_usage;
create policy own_api_usage on api_usage
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists own_weights on lead_score_weights;
create policy own_weights on lead_score_weights
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 子テーブルは親の所有者に従う
drop policy if exists own_business_history on business_history;
create policy own_business_history on business_history
  for all using (
    exists (select 1 from businesses b where b.id = business_id and b.owner_id = auth.uid())
  );

drop policy if exists own_subqueries on search_subqueries;
create policy own_subqueries on search_subqueries
  for all using (
    exists (select 1 from search_jobs j where j.id = job_id and j.owner_id = auth.uid())
  );
