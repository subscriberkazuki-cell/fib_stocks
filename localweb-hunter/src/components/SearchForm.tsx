'use client';

// 検索画面（§11-1）
//
// 実行フローは必ず2段階：
//   1. 推定コストを表示する
//   2. ユーザーが明示的に確認して初めて実行する
// 「押したら課金が始まっていた」を構造的に起こさないため、
// 見積もりを取る前は実行ボタンを出さない。

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CATEGORY_PRESETS, DEFAULT_CRITERIA, REGION_PRESETS } from '@/config/defaults';
import type { LeadPriority, SearchCriteria } from '@/types/business';
import { formatUsd } from './ui';

interface EstimateResponse {
  estimate: {
    phase1: { subQueryCount: number; requestCount: number; estimatedItemCount: number; totalCost: number };
    phase2: { qualifiedCount: number; totalCost: number };
    grandTotal: number;
    isFree: boolean;
  };
  subQueryCount: number;
  subQueryLabels: string[];
  providerName: string;
  providerBillable: boolean;
  budget: { monthlySpent: number; monthlyLimit: number; monthlyRemaining: number };
  exceedsBudget: boolean;
}

interface StatusResponse {
  businessProvider: { name: string; billable: boolean; message: string; hasRatings: boolean };
  searchProvider: { name: string; configured: boolean };
  aiProvider: { name: string; modelId: string; billable: boolean };
  budget: { monthlySpent: number; monthlyLimit: number };
  storedBusinesses: number;
}

const RATING_OPTIONS = [3.0, 3.5, 3.7, 4.0, 4.2, 4.5];
const REVIEW_OPTIONS = [1, 5, 10, 20, 50, 100, 500];
const RADIUS_OPTIONS = [1, 3, 5, 10, 20, 50];

export function SearchForm(): React.ReactElement {
  const router = useRouter();
  const [criteria, setCriteria] = useState<SearchCriteria>(DEFAULT_CRITERIA);
  const [regionIndex, setRegionIndex] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/status')
      .then((r) => r.json())
      .then((d: StatusResponse) => setStatus(d))
      .catch(() => setStatus(null));
  }, []);

  // 条件を変えたら見積もりは無効になる。古い金額のまま実行させない。
  const update = (patch: Partial<SearchCriteria>): void => {
    setCriteria((prev) => ({ ...prev, ...patch }));
    setEstimate(null);
    setResult(null);
  };

  const selectRegion = (index: number): void => {
    const preset = REGION_PRESETS[index];
    if (!preset) return;
    setRegionIndex(index);
    update({
      region: {
        kind: 'coordinate',
        city: preset.city,
        prefecture: preset.prefecture,
        centerLat: preset.lat,
        centerLng: preset.lng,
        radiusKm: criteria.region.radiusKm ?? 5,
      },
    });
  };

  const runEstimate = async (): Promise<void> => {
    setEstimating(true);
    setError(null);
    try {
      const res = await fetch('/api/search/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(criteria),
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? '見積もりに失敗しました');
      setEstimate(data as EstimateResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : '見積もりに失敗しました');
    } finally {
      setEstimating(false);
    }
  };

  const runSearch = async (): Promise<void> => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/search/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(criteria),
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? '検索に失敗しました');

      const d = data as {
        phase1: { fetched: number; qualified: number; created: number; duplicates: number; stoppedByBudget: boolean; budgetMessage: string | null; errors: string[] };
        phase2: { enrichedCount: number; remaining: number; stoppedByBudget: boolean; errors: string[] };
        actualCostUsd: number;
      };

      const parts = [
        `${d.phase1.fetched}件調査 / ${d.phase1.created}件を新規登録 / 重複${d.phase1.duplicates}件`,
        `Phase2で${d.phase2.enrichedCount}件を詳細調査（未調査 残り${d.phase2.remaining}件）`,
        `実コスト: ${formatUsd(d.actualCostUsd)}`,
      ];
      if (d.phase1.stoppedByBudget) parts.push(`⚠️ 予算上限で停止しました: ${d.phase1.budgetMessage ?? ''}`);
      if (d.phase2.stoppedByBudget) parts.push('⚠️ Phase2が予算上限で停止しました');
      const errs = [...d.phase1.errors, ...d.phase2.errors];
      if (errs.length > 0) parts.push(`エラー${errs.length}件: ${errs[0] ?? ''}`);

      setResult(parts.join('\n'));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '検索に失敗しました');
    } finally {
      setRunning(false);
    }
  };

  const noRatings = status?.businessProvider.hasRatings === false;

  return (
    <div className="space-y-4">
      {status && (
        <div className="card text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-medium">現在の構成</span>
            <span>
              データ:{' '}
              <span className={status.businessProvider.billable ? 'text-amber-700' : 'text-emerald-700'}>
                {status.businessProvider.name}
                {status.businessProvider.billable ? '（課金あり）' : '（$0）'}
              </span>
            </span>
            <span>
              Web検索: {status.searchProvider.configured ? status.searchProvider.name : '未設定（Stage 2をスキップ）'}
            </span>
            <span>
              AI: {status.aiProvider.name}
              {status.aiProvider.billable ? '（課金あり）' : '（$0）'}
            </span>
            <span>
              今月の使用額: {formatUsd(status.budget.monthlySpent)} / {formatUsd(status.budget.monthlyLimit)}
            </span>
            <span>登録済み: {status.storedBusinesses}件</span>
          </div>
          <p className="mt-2 text-xs text-stone-600">{status.businessProvider.message}</p>
        </div>
      )}

      <div className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="region">地域</label>
            <select
              id="region"
              className="input"
              value={regionIndex}
              onChange={(e) => selectRegion(Number(e.target.value))}
            >
              {REGION_PRESETS.map((p, i) => (
                <option key={p.label} value={i}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="radius">検索範囲</label>
            <select
              id="radius"
              className="input"
              value={criteria.region.radiusKm ?? 5}
              onChange={(e) => update({ region: { ...criteria.region, radiusKm: Number(e.target.value) } })}
            >
              {RADIUS_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}km</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="category">業種</label>
            <select
              id="category"
              className="input"
              value={criteria.categories[0] ?? ''}
              onChange={(e) => update({ categories: e.target.value ? [e.target.value] : [] })}
            >
              <option value="">全業種</option>
              {CATEGORY_PRESETS.map((c) => (
                <option key={c.key} value={c.label}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="minRating">最低評価</label>
            <select
              id="minRating"
              className="input"
              disabled={noRatings}
              value={criteria.minRating}
              onChange={(e) => update({ minRating: Number(e.target.value) })}
            >
              {RATING_OPTIONS.map((r) => (
                <option key={r} value={r}>{r.toFixed(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="minReview">最低レビュー数</label>
            <select
              id="minReview"
              className="input"
              disabled={noRatings}
              value={criteria.minReviewCount}
              onChange={(e) => update({ minReviewCount: Number(e.target.value) })}
            >
              {REVIEW_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}件</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={criteria.noWebsiteOnly}
                onChange={(e) => update({ noWebsiteOnly: e.target.checked })}
              />
              HPなしのみ
            </label>
          </div>
        </div>

        {noRatings && (
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
            現在のデータソース（OpenStreetMap）は評価・レビュー件数を持たないため、
            これらの条件は適用されません。評価でのランキングが必要な場合は
            DataForSEO などのプロバイダに切り替えてください。
          </p>
        )}

        <button
          type="button"
          className="text-sm text-stone-600 underline"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? '詳細条件を隠す' : '詳細条件を表示'}
        </button>

        {showAdvanced && (
          <div className="grid gap-3 rounded-md bg-stone-50 p-3 sm:grid-cols-2">
            <Checkbox
              label="SNSのみの店舗を含む"
              hint="Phase 2 の調査後に判定されます"
              checked={criteria.includeSnsOnly}
              onChange={(v) => update({ includeSnsOnly: v })}
            />
            <Checkbox
              label="低品質HPありの店舗を含む（リニューアル営業）"
              checked={criteria.includeLowQualitySite}
              onChange={(v) => update({ includeLowQualitySite: v })}
            />
            <Checkbox
              label="電話番号がある店舗のみ"
              checked={criteria.requirePhone}
              onChange={(v) => update({ requirePhone: v })}
            />
            <Checkbox
              label="メールがある店舗のみ"
              hint="メールはPhase 2で初めて分かるため、調査後に絞り込まれます"
              checked={criteria.requireEmail}
              onChange={(v) => update({ requireEmail: v })}
            />
            <Checkbox
              label="Phase 2（サイト解析・メール探索）まで実行"
              checked={criteria.runPhase2}
              onChange={(v) => update({ runPhase2: v })}
            />
            <Checkbox
              label="AI営業分析まで実行"
              checked={criteria.runAiAnalysis}
              onChange={(v) => update({ runAiAnalysis: v })}
            />
            <Checkbox
              label="全件調査モード（地点・業種に分割して網羅的に調べる）"
              checked={criteria.exhaustive}
              onChange={(v) => update({ exhaustive: v })}
            />
            <div>
              <label className="label" htmlFor="minPriority">営業優先度の下限</label>
              <select
                id="minPriority"
                className="input"
                value={criteria.minPriority ?? ''}
                onChange={(e) => update({ minPriority: (e.target.value || null) as LeadPriority | null })}
              >
                <option value="">指定なし</option>
                {(['S', 'A', 'B', 'C'] as const).map((p) => (
                  <option key={p} value={p}>{p}以上</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4">
          <button type="button" className="btn-secondary" onClick={() => void runEstimate()} disabled={estimating}>
            {estimating ? '計算中…' : '推定コストを計算'}
          </button>

          {estimate && (
            <>
              <span className="text-sm">
                推定コスト:{' '}
                <strong className={estimate.estimate.isFree ? 'text-emerald-700' : 'text-amber-700'}>
                  {formatUsd(estimate.estimate.grandTotal)}
                </strong>
                <span className="ml-2 text-stone-500">
                  （{estimate.subQueryCount}クエリ・約{estimate.estimate.phase1.estimatedItemCount}件を想定）
                </span>
              </span>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void runSearch()}
                disabled={running || estimate.exceedsBudget}
              >
                {running ? '検索中…（数分かかることがあります）' : '確認して店舗を探す'}
              </button>
            </>
          )}
        </div>

        {estimate?.exceedsBudget && (
          <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">
            この検索は予算上限を超えるため実行できません。今月の残り{' '}
            {formatUsd(estimate.budget.monthlyRemaining)} に対して{' '}
            {formatUsd(estimate.estimate.grandTotal)} が必要です。
            検索範囲を狭めるか、MONTHLY_BUDGET_USD を見直してください。
          </p>
        )}

        {!estimate && (
          <p className="text-xs text-stone-500">
            実行の前に必ず推定コストを表示します。金額を確認してから実行してください。
          </p>
        )}

        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {result && (
          <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
            <pre className="whitespace-pre-wrap font-sans">{result}</pre>
            <Link href="/leads" className="mt-2 inline-block underline">リード一覧を見る →</Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Checkbox({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): React.ReactElement {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-stone-500">{hint}</span>}
      </span>
    </label>
  );
}
