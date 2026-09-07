// Repository — アプリ本体が触る唯一のデータアクセス層。
// UI・オーケストレータはここより下（SQLの存在）を知らない。
// Supabaseへ差し替える場合はこのファイルと同じ関数群を用意すればよい。

import 'server-only';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getDb } from './sqlite';
import { rowToBusiness, rowToJob, rowToSubQuery, rowToUsage, type Row } from './rowMappers';
import { DEFAULT_PRIORITY_THRESHOLDS, DEFAULT_WEIGHTS } from '@/config/defaults';
import type {
  ApiUsageEntry,
  ApiUsageKind,
  Business,
  BusinessMetrics,
  JobStatus,
  LeadPriority,
  LeadScoreWeights,
  LeadStatus,
  PriorityThresholds,
  SearchCriteria,
  SearchJob,
  SearchLogEntry,
  SubQuery,
  SubQueryParams,
  SubQueryStatus,
} from '@/types/business';

function now(): string {
  return new Date().toISOString();
}

function conn(db?: DatabaseSync): DatabaseSync {
  return db ?? getDb();
}

// ============================================================
// 設定（重み・閾値）
// ============================================================

export interface ScoringSettings {
  weights: LeadScoreWeights;
  thresholds: PriorityThresholds;
}

export function getScoringSettings(db?: DatabaseSync): ScoringSettings {
  const c = conn(db);
  const row = c
    .prepare('SELECT * FROM lead_score_weights WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1')
    .get() as Row | undefined;

  if (!row) return { weights: { ...DEFAULT_WEIGHTS }, thresholds: { ...DEFAULT_PRIORITY_THRESHOLDS } };

  const num = (k: string, d: number): number => (typeof row[k] === 'number' ? (row[k] as number) : d);
  return {
    weights: {
      rating: num('rating_weight', DEFAULT_WEIGHTS.rating),
      reviewCount: num('review_count_weight', DEFAULT_WEIGHTS.reviewCount),
      noWebsite: num('no_website_weight', DEFAULT_WEIGHTS.noWebsite),
      hasSns: num('has_sns_weight', DEFAULT_WEIGHTS.hasSns),
      hasPhone: num('has_phone_weight', DEFAULT_WEIGHTS.hasPhone),
      localDensity: num('local_density_weight', DEFAULT_WEIGHTS.localDensity),
      footTraffic: num('foot_traffic_weight', DEFAULT_WEIGHTS.footTraffic),
      webImprovementPotential: num('web_improvement_weight', DEFAULT_WEIGHTS.webImprovementPotential),
    },
    thresholds: {
      S: num('threshold_s', DEFAULT_PRIORITY_THRESHOLDS.S),
      A: num('threshold_a', DEFAULT_PRIORITY_THRESHOLDS.A),
      B: num('threshold_b', DEFAULT_PRIORITY_THRESHOLDS.B),
      C: num('threshold_c', DEFAULT_PRIORITY_THRESHOLDS.C),
    },
  };
}

export function saveScoringSettings(settings: ScoringSettings, db?: DatabaseSync): void {
  const c = conn(db);
  c.prepare('UPDATE lead_score_weights SET is_active = 0').run();
  c.prepare(
    `INSERT INTO lead_score_weights
      (id, name, rating_weight, review_count_weight, no_website_weight, has_sns_weight,
       has_phone_weight, local_density_weight, foot_traffic_weight, web_improvement_weight,
       threshold_s, threshold_a, threshold_b, threshold_c, is_active, updated_at)
     VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    randomUUID(),
    settings.weights.rating,
    settings.weights.reviewCount,
    settings.weights.noWebsite,
    settings.weights.hasSns,
    settings.weights.hasPhone,
    settings.weights.localDensity,
    settings.weights.footTraffic,
    settings.weights.webImprovementPotential,
    settings.thresholds.S,
    settings.thresholds.A,
    settings.thresholds.B,
    settings.thresholds.C,
    now()
  );
}

// ============================================================
// businesses
// ============================================================

export function findBySourceId(source: string, sourceBusinessId: string, db?: DatabaseSync): Business | null {
  const row = conn(db)
    .prepare('SELECT * FROM businesses WHERE source = ? AND source_business_id = ?')
    .get(source, sourceBusinessId) as Row | undefined;
  return row ? rowToBusiness(row) : null;
}

export function getBusiness(id: string, db?: DatabaseSync): Business | null {
  const row = conn(db).prepare('SELECT * FROM businesses WHERE id = ?').get(id) as Row | undefined;
  return row ? rowToBusiness(row) : null;
}

/**
 * 重複排除の候補を引く。
 * 電話番号一致だけで統合すると、テナントビルやチェーン本部番号で誤統合が起きる（§10-1）。
 * ここでは「候補」だけを広めに取り、統合の可否は dedupe 側の複合条件で判断する。
 */
export function findDedupeCandidates(
  args: { normalizedPhone: string | null; name: string; latitude: number | null; longitude: number | null },
  db?: DatabaseSync
): Business[] {
  const c = conn(db);
  const rows: Row[] = [];

  if (args.normalizedPhone) {
    rows.push(
      ...(c
        .prepare(`SELECT * FROM businesses WHERE replace(replace(replace(ifnull(phone,''), '-', ''), ' ', ''), '+81', '0') = ?`)
        .all(args.normalizedPhone) as Row[])
    );
  }
  rows.push(...(c.prepare('SELECT * FROM businesses WHERE name = ?').all(args.name) as Row[]));

  if (args.latitude !== null && args.longitude !== null) {
    // 緯度経度で粗く絞る（約±1.1km）。厳密な距離判定は dedupe 側で行う。
    const d = 0.01;
    rows.push(
      ...(c
        .prepare('SELECT * FROM businesses WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?')
        .all(args.latitude - d, args.latitude + d, args.longitude - d, args.longitude + d) as Row[])
    );
  }

  const seen = new Set<string>();
  const out: Business[] = [];
  for (const row of rows) {
    const id = String(row['id']);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(rowToBusiness(row));
  }
  return out;
}

export function upsertBusiness(biz: Business, db?: DatabaseSync): void {
  const c = conn(db);
  c.prepare(
    `INSERT INTO businesses (
       id, source, source_business_id, name, category, address, prefecture, city, latitude, longitude,
       phone, phone_source, phone_source_url, phone_verified, phone_observed_at,
       email, email_source, email_source_url, email_verified, email_observed_at,
       rating, rating_source, rating_observed_at, review_count, review_count_source, review_count_observed_at,
       website_url, website_status, web_presence_score, website_opportunity_score, website_signals_json,
       candidate_urls_json, social_urls_json, google_maps_url, opening_hours,
       lead_score, lead_score_breakdown_json, sales_priority, sales_analysis_json, regulatory_notes_json,
       lead_status, next_action, last_contacted_at, next_contact_at, sales_notes, deal_value,
       phase2_completed_at, last_checked_at, created_at, updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?)
     ON CONFLICT(source, source_business_id) DO UPDATE SET
       name = excluded.name,
       category = excluded.category,
       address = excluded.address,
       prefecture = excluded.prefecture,
       city = excluded.city,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       phone = excluded.phone,
       phone_source = excluded.phone_source,
       phone_source_url = excluded.phone_source_url,
       phone_verified = excluded.phone_verified,
       phone_observed_at = excluded.phone_observed_at,
       email = excluded.email,
       email_source = excluded.email_source,
       email_source_url = excluded.email_source_url,
       email_verified = excluded.email_verified,
       email_observed_at = excluded.email_observed_at,
       rating = excluded.rating,
       rating_source = excluded.rating_source,
       rating_observed_at = excluded.rating_observed_at,
       review_count = excluded.review_count,
       review_count_source = excluded.review_count_source,
       review_count_observed_at = excluded.review_count_observed_at,
       website_url = excluded.website_url,
       website_status = excluded.website_status,
       web_presence_score = excluded.web_presence_score,
       website_opportunity_score = excluded.website_opportunity_score,
       website_signals_json = excluded.website_signals_json,
       candidate_urls_json = excluded.candidate_urls_json,
       social_urls_json = excluded.social_urls_json,
       google_maps_url = excluded.google_maps_url,
       opening_hours = excluded.opening_hours,
       lead_score = excluded.lead_score,
       lead_score_breakdown_json = excluded.lead_score_breakdown_json,
       sales_priority = excluded.sales_priority,
       sales_analysis_json = excluded.sales_analysis_json,
       regulatory_notes_json = excluded.regulatory_notes_json,
       phase2_completed_at = excluded.phase2_completed_at,
       last_checked_at = excluded.last_checked_at,
       updated_at = excluded.updated_at`
  ).run(
    biz.id, biz.source, biz.sourceBusinessId, biz.name, biz.category, biz.address,
    biz.prefecture, biz.city, biz.latitude, biz.longitude,
    biz.phone?.value ?? null, biz.phone?.source ?? null, biz.phone?.sourceUrl ?? null,
    biz.phone?.verified ? 1 : 0, biz.phone?.observedAt ?? null,
    biz.email?.value ?? null, biz.email?.source ?? null, biz.email?.sourceUrl ?? null,
    biz.email?.verified ? 1 : 0, biz.email?.observedAt ?? null,
    biz.rating?.value ?? null, biz.rating?.source ?? null, biz.rating?.observedAt ?? null,
    biz.reviewCount?.value ?? null, biz.reviewCount?.source ?? null, biz.reviewCount?.observedAt ?? null,
    biz.websiteUrl, biz.websiteStatus, biz.webPresenceScore, biz.websiteOpportunityScore,
    biz.websiteSignals ? JSON.stringify(biz.websiteSignals) : null,
    JSON.stringify(biz.candidateUrls), JSON.stringify(biz.socialUrls),
    biz.googleMapsUrl, biz.openingHours,
    biz.leadScore, biz.leadScoreBreakdown ? JSON.stringify(biz.leadScoreBreakdown) : null,
    biz.salesPriority, biz.salesAnalysis ? JSON.stringify(biz.salesAnalysis) : null,
    JSON.stringify(biz.regulatoryNotes),
    biz.leadStatus, biz.nextAction, biz.lastContactedAt, biz.nextContactAt, biz.salesNotes, biz.dealValue,
    biz.phase2CompletedAt, biz.lastCheckedAt, biz.createdAt, biz.updatedAt
  );
}

export interface ListFilters {
  city?: string;
  category?: string;
  minLeadScore?: number;
  minPriority?: LeadPriority;
  websiteStatuses?: string[];
  leadStatus?: LeadStatus;
  requireEmail?: boolean;
  requirePhone?: boolean;
  query?: string;
  sort?: 'leadScore' | 'rating' | 'reviewCount' | 'priority' | 'updatedAt';
  limit?: number;
  offset?: number;
}

const PRIORITY_ORDER: Record<LeadPriority, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 };

export function listBusinesses(filters: ListFilters = {}, db?: DatabaseSync): Business[] {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filters.city) { where.push('city = ?'); params.push(filters.city); }
  if (filters.category) { where.push('category = ?'); params.push(filters.category); }
  if (filters.minLeadScore !== undefined) { where.push('lead_score >= ?'); params.push(filters.minLeadScore); }
  if (filters.leadStatus) { where.push('lead_status = ?'); params.push(filters.leadStatus); }
  if (filters.requireEmail) where.push("email IS NOT NULL AND email != ''");
  if (filters.requirePhone) where.push("phone IS NOT NULL AND phone != ''");
  if (filters.websiteStatuses?.length) {
    where.push(`website_status IN (${filters.websiteStatuses.map(() => '?').join(',')})`);
    params.push(...filters.websiteStatuses);
  }
  if (filters.minPriority) {
    const allowed = (Object.keys(PRIORITY_ORDER) as LeadPriority[])
      .filter((p) => PRIORITY_ORDER[p] >= PRIORITY_ORDER[filters.minPriority as LeadPriority]);
    where.push(`sales_priority IN (${allowed.map(() => '?').join(',')})`);
    params.push(...allowed);
  }
  if (filters.query) {
    where.push('(name LIKE ? OR address LIKE ? OR category LIKE ?)');
    const q = `%${filters.query}%`;
    params.push(q, q, q);
  }

  const orderBy = {
    leadScore: 'lead_score DESC',
    rating: 'rating DESC',
    reviewCount: 'review_count DESC',
    priority: `CASE sales_priority WHEN 'S' THEN 5 WHEN 'A' THEN 4 WHEN 'B' THEN 3 WHEN 'C' THEN 2 ELSE 1 END DESC, lead_score DESC`,
    updatedAt: 'updated_at DESC',
  }[filters.sort ?? 'leadScore'];

  const sql =
    `SELECT * FROM businesses ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ` +
    `ORDER BY ${orderBy} NULLS LAST LIMIT ? OFFSET ?`;
  params.push(filters.limit ?? 200, filters.offset ?? 0);

  return (conn(db).prepare(sql).all(...params) as Row[]).map(rowToBusiness);
}

export function countBusinesses(db?: DatabaseSync): number {
  const row = conn(db).prepare('SELECT COUNT(*) AS c FROM businesses').get() as Row | undefined;
  return typeof row?.['c'] === 'number' ? (row['c'] as number) : 0;
}

export interface CrmUpdate {
  leadStatus?: LeadStatus;
  salesNotes?: string | null;
  nextAction?: string | null;
  nextContactAt?: string | null;
  lastContactedAt?: string | null;
  dealValue?: number | null;
}

export function updateCrm(id: string, patch: CrmUpdate, db?: DatabaseSync): Business | null {
  const c = conn(db);
  const current = getBusiness(id, c);
  if (!current) return null;

  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const push = (col: string, v: string | number | null): void => { sets.push(`${col} = ?`); params.push(v); };

  if (patch.leadStatus !== undefined) push('lead_status', patch.leadStatus);
  if (patch.salesNotes !== undefined) push('sales_notes', patch.salesNotes);
  if (patch.nextAction !== undefined) push('next_action', patch.nextAction);
  if (patch.nextContactAt !== undefined) push('next_contact_at', patch.nextContactAt);
  if (patch.lastContactedAt !== undefined) push('last_contacted_at', patch.lastContactedAt);
  if (patch.dealValue !== undefined) push('deal_value', patch.dealValue);
  if (sets.length === 0) return current;

  push('updated_at', now());
  params.push(id);
  c.prepare(`UPDATE businesses SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  // ステータスが変わった瞬間のスコアをスナップショットとして残す（§10-3）。
  // これがないと「スコアが高い店は実際に成約したのか」を後から検証できない。
  if (patch.leadStatus !== undefined && patch.leadStatus !== current.leadStatus) {
    recordHistory(
      {
        businessId: id,
        event: 'status_changed',
        rating: current.rating?.value ?? null,
        reviewCount: current.reviewCount?.value ?? null,
        websiteStatus: current.websiteStatus,
        leadScore: current.leadScore,
        leadScoreBreakdown: current.leadScoreBreakdown,
        leadStatus: patch.leadStatus,
        note: `${current.leadStatus} → ${patch.leadStatus}`,
      },
      c
    );
  }

  return getBusiness(id, c);
}

// ============================================================
// business_history
// ============================================================

export interface HistoryInput {
  businessId: string;
  event: string;
  rating: number | null;
  reviewCount: number | null;
  websiteStatus: string | null;
  leadScore: number | null;
  leadScoreBreakdown: unknown;
  leadStatus: string | null;
  note: string | null;
}

export function recordHistory(input: HistoryInput, db?: DatabaseSync): void {
  conn(db)
    .prepare(
      `INSERT INTO business_history
        (id, business_id, event, rating, review_count, website_status, lead_score,
         lead_score_breakdown_json, lead_status, note, recorded_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      randomUUID(), input.businessId, input.event, input.rating, input.reviewCount,
      input.websiteStatus, input.leadScore,
      input.leadScoreBreakdown ? JSON.stringify(input.leadScoreBreakdown) : null,
      input.leadStatus, input.note, now()
    );
}

export function getHistory(businessId: string, db?: DatabaseSync): Row[] {
  return conn(db)
    .prepare('SELECT * FROM business_history WHERE business_id = ? ORDER BY recorded_at DESC LIMIT 100')
    .all(businessId) as Row[];
}

// ============================================================
// api_usage / 予算
// ============================================================

export function recordUsage(
  entry: Omit<ApiUsageEntry, 'id' | 'occurredAt'> & { occurredAt?: string },
  db?: DatabaseSync
): void {
  conn(db)
    .prepare(
      `INSERT INTO api_usage (id, occurred_at, kind, provider, request_count, item_count, cost_usd, job_id, note)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(
      randomUUID(), entry.occurredAt ?? now(), entry.kind, entry.provider,
      entry.requestCount, entry.itemCount, entry.costUsd, entry.jobId, entry.note
    );
}

function sumCost(sinceIso: string, db?: DatabaseSync): number {
  const row = conn(db)
    .prepare('SELECT COALESCE(SUM(cost_usd), 0) AS total FROM api_usage WHERE occurred_at >= ?')
    .get(sinceIso) as Row | undefined;
  return typeof row?.['total'] === 'number' ? (row['total'] as number) : 0;
}

export function startOfMonthIso(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export function startOfDayIso(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

export function getMonthlySpend(db?: DatabaseSync): number {
  return sumCost(startOfMonthIso(), db);
}

export function getDailySpend(db?: DatabaseSync): number {
  return sumCost(startOfDayIso(), db);
}

export interface UsageBreakdown {
  kind: ApiUsageKind;
  requestCount: number;
  itemCount: number;
  costUsd: number;
}

export function getUsageBreakdown(sinceIso: string, db?: DatabaseSync): UsageBreakdown[] {
  const rows = conn(db)
    .prepare(
      `SELECT kind,
              COALESCE(SUM(request_count),0) AS request_count,
              COALESCE(SUM(item_count),0) AS item_count,
              COALESCE(SUM(cost_usd),0) AS cost_usd
       FROM api_usage WHERE occurred_at >= ? GROUP BY kind`
    )
    .all(sinceIso) as Row[];
  return rows.map((r) => ({
    kind: String(r['kind']) as ApiUsageKind,
    requestCount: Number(r['request_count'] ?? 0),
    itemCount: Number(r['item_count'] ?? 0),
    costUsd: Number(r['cost_usd'] ?? 0),
  }));
}

export function listRecentUsage(limit = 50, db?: DatabaseSync): ApiUsageEntry[] {
  return (conn(db).prepare('SELECT * FROM api_usage ORDER BY occurred_at DESC LIMIT ?').all(limit) as Row[])
    .map(rowToUsage);
}

/** 直近1時間の検索実行回数（レート制限用, §4-3） */
export function countRecentSearches(withinMinutes: number, db?: DatabaseSync): number {
  const since = new Date(Date.now() - withinMinutes * 60_000).toISOString();
  const row = conn(db)
    .prepare('SELECT COUNT(*) AS c FROM search_jobs WHERE created_at >= ?')
    .get(since) as Row | undefined;
  return typeof row?.['c'] === 'number' ? (row['c'] as number) : 0;
}

// ============================================================
// search_jobs / subqueries（レジューム用, §12-2）
// ============================================================

export function createJob(criteria: SearchCriteria, subQueries: { label: string; params: SubQueryParams }[], db?: DatabaseSync): SearchJob {
  const c = conn(db);
  const id = randomUUID();
  const ts = now();

  c.prepare(
    `INSERT INTO search_jobs (id, status, criteria_json, total_subqueries, created_at, updated_at)
     VALUES (?, 'pending', ?, ?, ?, ?)`
  ).run(id, JSON.stringify(criteria), subQueries.length, ts, ts);

  const stmt = c.prepare(
    `INSERT INTO search_subqueries (id, job_id, seq, status, label, params_json, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?)`
  );
  subQueries.forEach((sq, i) => {
    stmt.run(randomUUID(), id, i, sq.label, JSON.stringify(sq.params), ts);
  });

  const job = getJob(id, c);
  if (!job) throw new Error('ジョブの作成に失敗しました');
  return job;
}

export function getJob(id: string, db?: DatabaseSync): SearchJob | null {
  const row = conn(db).prepare('SELECT * FROM search_jobs WHERE id = ?').get(id) as Row | undefined;
  return row ? rowToJob(row) : null;
}

export function listJobs(limit = 20, db?: DatabaseSync): SearchJob[] {
  return (conn(db).prepare('SELECT * FROM search_jobs ORDER BY created_at DESC LIMIT ?').all(limit) as Row[])
    .map(rowToJob);
}

export function getSubQueries(jobId: string, db?: DatabaseSync): SubQuery[] {
  return (conn(db).prepare('SELECT * FROM search_subqueries WHERE job_id = ? ORDER BY seq').all(jobId) as Row[])
    .map(rowToSubQuery);
}

/** 未完了のサブクエリだけを返す。中断後のレジュームはこれを使う（§12-2） */
export function getPendingSubQueries(jobId: string, db?: DatabaseSync): SubQuery[] {
  return (
    conn(db)
      .prepare(`SELECT * FROM search_subqueries WHERE job_id = ? AND status IN ('pending','running','failed') ORDER BY seq`)
      .all(jobId) as Row[]
  ).map(rowToSubQuery);
}

export function updateSubQuery(
  id: string,
  patch: { status?: SubQueryStatus; cursor?: string | null; fetchedCount?: number; costUsd?: number; errorMessage?: string | null; attempts?: number },
  db?: DatabaseSync
): void {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const push = (col: string, v: string | number | null): void => { sets.push(`${col} = ?`); params.push(v); };

  if (patch.status !== undefined) push('status', patch.status);
  if (patch.cursor !== undefined) push('cursor', patch.cursor);
  if (patch.fetchedCount !== undefined) push('fetched_count', patch.fetchedCount);
  if (patch.costUsd !== undefined) push('cost_usd', patch.costUsd);
  if (patch.errorMessage !== undefined) push('error_message', patch.errorMessage);
  if (patch.attempts !== undefined) push('attempts', patch.attempts);
  if (sets.length === 0) return;

  push('updated_at', now());
  params.push(id);
  conn(db).prepare(`UPDATE search_subqueries SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

export function updateJob(
  id: string,
  patch: {
    status?: JobStatus;
    fetchedCount?: number;
    qualifiedCount?: number;
    newCount?: number;
    duplicateCount?: number;
    costUsd?: number;
    errorMessage?: string | null;
    finishedAt?: string | null;
  },
  db?: DatabaseSync
): void {
  const c = conn(db);
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const push = (col: string, v: string | number | null): void => { sets.push(`${col} = ?`); params.push(v); };

  if (patch.status !== undefined) push('status', patch.status);
  if (patch.fetchedCount !== undefined) push('fetched_count', patch.fetchedCount);
  if (patch.qualifiedCount !== undefined) push('qualified_count', patch.qualifiedCount);
  if (patch.newCount !== undefined) push('new_count', patch.newCount);
  if (patch.duplicateCount !== undefined) push('duplicate_count', patch.duplicateCount);
  if (patch.costUsd !== undefined) push('cost_usd', patch.costUsd);
  if (patch.errorMessage !== undefined) push('error_message', patch.errorMessage);
  if (patch.finishedAt !== undefined) push('finished_at', patch.finishedAt);

  sets.push(
    `completed_subqueries = (SELECT COUNT(*) FROM search_subqueries WHERE job_id = ? AND status = 'completed')`
  );
  params.push(id);

  push('updated_at', now());
  params.push(id);
  c.prepare(`UPDATE search_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

// ============================================================
// search_logs
// ============================================================

export function recordSearchLog(entry: Omit<SearchLogEntry, 'id' | 'searchedAt'>, db?: DatabaseSync): void {
  conn(db)
    .prepare(
      `INSERT INTO search_logs
        (id, job_id, searched_at, region, category, criteria_json, result_count, qualified_count,
         new_business_count, duplicate_count, api_request_count, api_item_count,
         api_cost_usd, web_search_cost_usd, ai_cost_usd, total_cost_usd)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      randomUUID(), entry.jobId, now(), entry.region, entry.category, JSON.stringify(entry.criteria),
      entry.resultCount, entry.qualifiedCount, entry.newBusinessCount, entry.duplicateCount,
      entry.apiRequestCount, entry.apiItemCount, entry.apiCostUsd,
      entry.webSearchCostUsd, entry.aiCostUsd, entry.totalCostUsd
    );
}

export function listSearchLogs(limit = 20, db?: DatabaseSync): Row[] {
  return conn(db).prepare('SELECT * FROM search_logs ORDER BY searched_at DESC LIMIT ?').all(limit) as Row[];
}

// ============================================================
// ビジネス指標（§13）
// 「件数」ではなく「成約まで到達したか」を測るための集計。
// ============================================================

export function getMetrics(db?: DatabaseSync): BusinessMetrics {
  const c = conn(db);
  const one = (sql: string, ...p: (string | number)[]): number => {
    const row = c.prepare(sql).get(...p) as Row | undefined;
    const v = row ? Object.values(row)[0] : 0;
    return typeof v === 'number' ? v : 0;
  };

  const leadsFound = one('SELECT COUNT(*) FROM businesses');
  // Qualified = Phase 2まで到達し、営業対象外にしていないリード
  const qualifiedLeads = one(
    `SELECT COUNT(*) FROM businesses WHERE phase2_completed_at IS NOT NULL AND lead_status != '営業対象外'`
  );
  const sTierLeads = one(`SELECT COUNT(*) FROM businesses WHERE sales_priority = 'S'`);

  // 「電話した」は履歴で数える。現在ステータスだけで数えると、
  // 電話→成約と進んだリードが calls から消えてしまうため。
  const callsMade = one(
    `SELECT COUNT(DISTINCT business_id) FROM business_history
     WHERE event = 'status_changed' AND lead_status IN ('電話済','留守','担当者不在','興味あり','提案済','成約','失注','保留')`
  );
  const contactsReached = one(
    `SELECT COUNT(DISTINCT business_id) FROM business_history
     WHERE event = 'status_changed' AND lead_status IN ('電話済','興味あり','提案済','成約','失注')`
  );
  const interested = one(
    `SELECT COUNT(DISTINCT business_id) FROM business_history
     WHERE event = 'status_changed' AND lead_status IN ('興味あり','提案済','成約')`
  );
  const proposals = one(
    `SELECT COUNT(DISTINCT business_id) FROM business_history
     WHERE event = 'status_changed' AND lead_status IN ('提案済','成約')`
  );
  const deals = one(`SELECT COUNT(*) FROM businesses WHERE lead_status = '成約'`);
  const revenue = one(`SELECT COALESCE(SUM(deal_value), 0) FROM businesses WHERE lead_status = '成約'`);

  return {
    leadsFound,
    qualifiedLeads,
    sTierLeads,
    callsMade,
    contactsReached,
    interested,
    proposals,
    deals,
    revenue,
    conversionRate: leadsFound > 0 ? deals / leadsFound : 0,
    averageDealValue: deals > 0 ? revenue / deals : 0,
    revenuePer100Leads: leadsFound > 0 ? (revenue / leadsFound) * 100 : 0,
  };
}
