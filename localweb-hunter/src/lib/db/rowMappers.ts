// DB行 <-> ドメインオブジェクトの変換。
//
// SQLiteは行を「文字列/数値/null」でしか返さないので、
// JSONカラムのパースと SourcedField の組み立てをここに集約している。
// any を使ってよいのはこの層の入口だけ（§14 開発時の共通ルール）。

import type {
  Business,
  BusinessMetrics,
  CandidateUrl,
  LeadPriority,
  LeadScoreBreakdown,
  LeadStatus,
  SalesAnalysis,
  SourcedField,
  DataFieldSource,
  WebsiteSignals,
  WebsiteStatus,
  SearchJob,
  SubQuery,
  SubQueryParams,
  SearchCriteria,
  ApiUsageEntry,
  ApiUsageKind,
  JobStatus,
  SubQueryStatus,
} from '@/types/business';

export type Row = Record<string, unknown>;

function s(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}
function n(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function b(v: unknown): boolean {
  return v === 1 || v === true || v === '1';
}

function json<T>(v: unknown, fallback: T): T {
  const raw = s(v);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 値・出所・観測日時が揃っているときだけ SourcedField を組み立てる。出所不明なら null（§2-3） */
function buildSourced<T extends string | number>(
  value: T | null,
  source: string | null,
  sourceUrl: string | null,
  verified: boolean,
  observedAt: string | null
): SourcedField<T> | null {
  if (value === null || source === null) return null;
  return {
    value,
    source: source as DataFieldSource,
    ...(sourceUrl ? { sourceUrl } : {}),
    verified,
    observedAt: observedAt ?? new Date(0).toISOString(),
  };
}

export function rowToBusiness(row: Row): Business {
  return {
    id: String(row['id']),
    source: String(row['source']),
    sourceBusinessId: String(row['source_business_id']),
    name: String(row['name']),
    category: s(row['category']) ?? '',
    address: s(row['address']) ?? '',
    prefecture: s(row['prefecture']) ?? '',
    city: s(row['city']) ?? '',
    latitude: n(row['latitude']),
    longitude: n(row['longitude']),

    phone: buildSourced(
      s(row['phone']),
      s(row['phone_source']),
      s(row['phone_source_url']),
      b(row['phone_verified']),
      s(row['phone_observed_at'])
    ),
    email: buildSourced(
      s(row['email']),
      s(row['email_source']),
      s(row['email_source_url']),
      b(row['email_verified']),
      s(row['email_observed_at'])
    ),
    rating: buildSourced(n(row['rating']), s(row['rating_source']), null, true, s(row['rating_observed_at'])),
    reviewCount: buildSourced(
      n(row['review_count']),
      s(row['review_count_source']),
      null,
      true,
      s(row['review_count_observed_at'])
    ),

    websiteUrl: s(row['website_url']),
    websiteStatus: (s(row['website_status']) ?? 'unknown') as WebsiteStatus,
    webPresenceScore: n(row['web_presence_score']) ?? 0,
    websiteOpportunityScore: n(row['website_opportunity_score']),
    websiteSignals: json<WebsiteSignals | null>(row['website_signals_json'], null),
    candidateUrls: json<CandidateUrl[]>(row['candidate_urls_json'], []),
    socialUrls: json<string[]>(row['social_urls_json'], []),
    googleMapsUrl: s(row['google_maps_url']),
    openingHours: s(row['opening_hours']),

    leadScore: n(row['lead_score']) ?? 0,
    leadScoreBreakdown: json<LeadScoreBreakdown | null>(row['lead_score_breakdown_json'], null),
    salesPriority: (s(row['sales_priority']) ?? 'D') as LeadPriority,
    salesAnalysis: json<SalesAnalysis | null>(row['sales_analysis_json'], null),
    regulatoryNotes: json<string[]>(row['regulatory_notes_json'], []),

    leadStatus: (s(row['lead_status']) ?? '未接触') as LeadStatus,
    nextAction: s(row['next_action']),
    lastContactedAt: s(row['last_contacted_at']),
    nextContactAt: s(row['next_contact_at']),
    salesNotes: s(row['sales_notes']),
    dealValue: n(row['deal_value']),

    phase2CompletedAt: s(row['phase2_completed_at']),
    lastCheckedAt: s(row['last_checked_at']),
    createdAt: String(row['created_at']),
    updatedAt: String(row['updated_at']),
  };
}

export function rowToJob(row: Row): SearchJob {
  return {
    id: String(row['id']),
    status: String(row['status']) as JobStatus,
    criteria: json<SearchCriteria>(row['criteria_json'], {} as SearchCriteria),
    totalSubQueries: n(row['total_subqueries']) ?? 0,
    completedSubQueries: n(row['completed_subqueries']) ?? 0,
    fetchedCount: n(row['fetched_count']) ?? 0,
    qualifiedCount: n(row['qualified_count']) ?? 0,
    newCount: n(row['new_count']) ?? 0,
    duplicateCount: n(row['duplicate_count']) ?? 0,
    costUsd: n(row['cost_usd']) ?? 0,
    errorMessage: s(row['error_message']),
    createdAt: String(row['created_at']),
    updatedAt: String(row['updated_at']),
    finishedAt: s(row['finished_at']),
  };
}

export function rowToSubQuery(row: Row): SubQuery {
  return {
    id: String(row['id']),
    jobId: String(row['job_id']),
    seq: n(row['seq']) ?? 0,
    status: String(row['status']) as SubQueryStatus,
    label: String(row['label']),
    params: json<SubQueryParams>(row['params_json'], {
      centerLat: null, centerLng: null, radiusKm: null, city: null, prefecture: null, category: null,
    }),
    cursor: s(row['cursor']),
    fetchedCount: n(row['fetched_count']) ?? 0,
    costUsd: n(row['cost_usd']) ?? 0,
    errorMessage: s(row['error_message']),
    attempts: n(row['attempts']) ?? 0,
    updatedAt: String(row['updated_at']),
  };
}

export function rowToUsage(row: Row): ApiUsageEntry {
  return {
    id: String(row['id']),
    occurredAt: String(row['occurred_at']),
    kind: String(row['kind']) as ApiUsageKind,
    provider: String(row['provider']),
    requestCount: n(row['request_count']) ?? 0,
    itemCount: n(row['item_count']) ?? 0,
    costUsd: n(row['cost_usd']) ?? 0,
    jobId: s(row['job_id']),
    note: s(row['note']),
  };
}

export function emptyMetrics(): BusinessMetrics {
  return {
    leadsFound: 0, qualifiedLeads: 0, sTierLeads: 0, callsMade: 0, contactsReached: 0,
    interested: 0, proposals: 0, deals: 0, revenue: 0, conversionRate: 0,
    averageDealValue: 0, revenuePer100Leads: 0,
  };
}
