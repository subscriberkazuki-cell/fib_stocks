// 補助金の見込みスコア。
//
// HP営業の Lead Score とは別軸。
// 「HPを提案する価値が高い店」と「補助金が通りそうな店」は重なるが同じではない。
//
// 重なる理由：評価が高く口コミが多い店は事業が成立しており、事業計画に説得力が出る。
//            HPがない店は「販路開拓の余地」が明確で、申請の理由が書きやすい。
//
// 違う理由：法人格（医療法人等）で対象外になる店がある。
//          従業員数の上限を超える店がある。
//          ウェブ単独申請ができないので、他に投資予定がないと申請が組めない。

import { screenEligibility, estimateSubsidy, type Eligibility } from '@/config/subsidy';
import { isSupportWorthwhile, minimumSubsidyForSupport, SUPPORT_SERVICES } from '@/config/subsidySupport';
import { isMissingOwnWebsite } from '@/lib/detection/noWebsiteDetection';
import { getPricing } from '@/config/pricing';
import { computeNextAction } from '@/lib/scoring/nextAction';
import type { Business } from '@/types/business';

export type SubsidyProspect = 'high' | 'medium' | 'low' | 'ineligible';

export interface SubsidyScoreResult {
  prospect: SubsidyProspect;
  score: number;
  eligibility: Eligibility;
  /** 加点・減点の内訳 */
  factors: { label: string; points: number; note: string }[];
  /** HP制作費だけで申請した場合の補助額 */
  subsidyOnWebOnly: number;
  /** サポートを有料で勧めてよいか */
  supportWorthwhile: boolean;
  /** サポートが成立する最低の補助金額 */
  supportBreakEven: number;
  /** 店主に確認すべきこと */
  toAsk: string[];
}

const SPARRING_FEE = SUPPORT_SERVICES.find((s) => s.key === 'plan_sparring')?.price ?? 49_800;

export function scoreSubsidyProspect(biz: Business): SubsidyScoreResult {
  const screen = screenEligibility(biz.category, biz.name);
  const next = computeNextAction(biz);
  const pricing = next.primary ? getPricing(next.primary.key) : null;
  const webCost = pricing?.withMonthly.initial ?? 98_000;
  const subsidyOnWebOnly = estimateSubsidy(webCost).subsidized;

  if (screen.status === 'likely_ineligible') {
    return {
      prospect: 'ineligible',
      score: 0,
      eligibility: screen.status,
      factors: [{ label: '対象外の法人格', points: 0, note: screen.reasons[0] ?? '' }],
      subsidyOnWebOnly: 0,
      supportWorthwhile: false,
      supportBreakEven: minimumSubsidyForSupport(SPARRING_FEE),
      toAsk: [],
    };
  }

  const factors: SubsidyScoreResult['factors'] = [];

  // 事業が成立していることは、事業計画の説得力に直結する。
  // 審査でも「実現可能性」が見られるので、実績のある店ほど通りやすい。
  const rating = biz.rating?.value ?? null;
  const reviews = biz.reviewCount?.value ?? null;

  if (rating !== null && rating >= 4.3) {
    factors.push({ label: '評価が高い', points: 20, note: `評価${rating}。事業が成立している証拠として計画に使える。` });
  } else if (rating !== null && rating >= 3.7) {
    factors.push({ label: '評価は標準以上', points: 10, note: `評価${rating}。` });
  }

  if (reviews !== null && reviews >= 100) {
    factors.push({ label: '口コミが多い', points: 20, note: `${reviews}件。集客の実績を数字で示せる。` });
  } else if (reviews !== null && reviews >= 30) {
    factors.push({ label: '口コミが一定数ある', points: 10, note: `${reviews}件。` });
  }

  // HPがないことは、販路開拓の必要性として申請書に書きやすい。
  // 「今できていないこと」が明確な方が、計画の説得力が出る。
  if (isMissingOwnWebsite(biz.websiteStatus)) {
    factors.push({
      label: '公式サイトがない',
      points: 25,
      note: '販路開拓の余地が明確で、申請理由として最も書きやすい状態。',
    });
  } else if (biz.websiteStatus === 'official_low_quality') {
    factors.push({
      label: 'サイトはあるが改善余地が大きい',
      points: 15,
      note: '改修も補助対象。現状の課題を具体的に示せる。',
    });
  }

  // 従業員数の上限に余裕があるか。20人枠の業種は要件を満たしやすい。
  if (screen.employeeLimit.limit === 20) {
    factors.push({
      label: '従業員数の上限が20人',
      points: 10,
      note: `${screen.employeeLimit.label}。要件を満たしやすい。`,
    });
  } else {
    factors.push({
      label: '従業員数の上限が5人',
      points: 5,
      note: `${screen.employeeLimit.label}。個人店なら問題ないが、確認が必要。`,
    });
  }

  // 法人格の確認が要る業種は減点（対象外の可能性が残る）
  if (screen.status === 'needs_check') {
    factors.push({
      label: '法人格の確認が必要',
      points: -20,
      note: screen.reasons[0] ?? '',
    });
  }

  // 連絡が取れないと何も始まらない
  if (biz.phone !== null) {
    factors.push({ label: '電話番号がある', points: 10, note: '案内できる状態。' });
  }

  const score = Math.max(0, Math.min(100, factors.reduce((a, f) => a + f.points, 0)));

  const prospect: SubsidyProspect =
    screen.status === 'needs_check' ? 'medium' : score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';

  return {
    prospect,
    score,
    eligibility: screen.status,
    factors,
    subsidyOnWebOnly,
    // HP制作費の分だけで、すでにサポート料に見合うか。
    // ウェブ単独では申請できないので実際の申請額はこれより大きくなる。
    // つまりここが true なら安全に勧められ、false なら他の投資を確認してからでないと勧められない。
    supportWorthwhile: isSupportWorthwhile(subsidyOnWebOnly, SPARRING_FEE),
    supportBreakEven: minimumSubsidyForSupport(SPARRING_FEE),
    toAsk: [
      ...screen.toConfirm,
      // ★ これが営業上もっとも重要な質問。
      //   ウェブ関連費だけでは申請そのものができないので、答えが出ないと申請が組めない。
      //   安いプランではこの答え次第でサポートの採算も変わる。
      '店舗の改装・機材の入れ替え・看板など、ほかに投資を考えているものはないか',
    ],
  };
}

export const PROSPECT_LABELS: Record<SubsidyProspect, { label: string; tone: string }> = {
  high: { label: '見込み高', tone: 'bg-emerald-100 text-emerald-800' },
  medium: { label: '要確認', tone: 'bg-amber-100 text-amber-800' },
  low: { label: '見込み低', tone: 'bg-stone-100 text-stone-600' },
  ineligible: { label: '対象外', tone: 'bg-stone-200 text-stone-500' },
};
