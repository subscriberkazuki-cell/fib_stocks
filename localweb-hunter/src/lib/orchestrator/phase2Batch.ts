// Phase 2 のバッチ実行（§12-3）
//
// なぜ専用モジュールにしたか：
// Phase 2 は1店舗あたり最大 (robots 1回 + 最大5ページ) × 2秒間隔 = 12秒以上かかる。
// 公式サイト候補の判定でさらに数回取得するので、25件を素直に回すと7分を超え、
// サーバーレス実行の上限（maxDuration）を突き抜けて途中で殺される。
// 途中で殺されると「何件終わったか」もクライアントに返らない。
//
// そこで **締め切りを持ったループ** にして、残り時間が1店舗分を切ったら
// 自分で綺麗に打ち切り、残件数を返す。UIはそれを見て続きを回せる。

import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import type { Business } from '@/types/business';
import type { Phase2Deps } from './phase2';
import { enrichAndRescore } from './enrichPipeline';
import { isBudgetExceeded } from '@/lib/budget/budgetGuard';
import { passesPostEnrichFilter } from './phase1Rules';
import type { SearchCriteria } from '@/types/business';

export interface Phase2BatchResult {
  enriched: number;
  /** 調査の結果、検索条件（SNSのみを含むか・メール必須か等）を満たした件数 */
  qualified: number;
  errors: string[];
  stoppedByBudget: boolean;
  /** 締め切りに達して自主的に打ち切った */
  stoppedByDeadline: boolean;
}

export interface Phase2BatchOptions {
  runAiAnalysis: boolean;
  /** この時刻を過ぎたら新しい店舗に着手しない（epoch ms） */
  deadlineAt: number;
  /**
   * 調査後にしか判定できない条件（SNSのみを含むか・メール必須か）。
   * 該当しなかった店舗もDBには残す — 取得済みのデータを捨てる理由がないため。
   * 通過数だけを数えて呼び出し元に返す。
   */
  postFilter?: Pick<SearchCriteria, 'includeSnsOnly' | 'requireEmail' | 'requirePhone'>;
  db?: DatabaseSync;
}

/**
 * 1店舗の調査に要する時間の見積もり。
 * クロール間隔が支配的なので、そこから逆算する。
 */
export function estimatePerBusinessMs(minIntervalMs: number, maxPagesPerSite: number): number {
  // robots.txt 1回 + サイト本体 + 連絡先ページ(最大 maxPages-1) + 公式サイト候補の判定(最大3)
  const requests = 1 + 1 + Math.max(0, maxPagesPerSite - 1) + 3;
  return requests * minIntervalMs;
}

export async function runPhase2Batch(
  targets: Business[],
  deps: Phase2Deps,
  opts: Phase2BatchOptions
): Promise<Phase2BatchResult> {
  const result: Phase2BatchResult = {
    enriched: 0,
    qualified: 0,
    errors: [],
    stoppedByBudget: false,
    stoppedByDeadline: false,
  };

  const perBusinessMs = estimatePerBusinessMs(deps.minIntervalMs, deps.maxPagesPerSite);

  for (const target of targets) {
    // 残り時間が1店舗分に満たないなら、着手せずに打ち切る。
    // 着手して途中で殺されるより、やらずに残件として返す方が回復しやすい。
    if (Date.now() + perBusinessMs > opts.deadlineAt) {
      result.stoppedByDeadline = true;
      break;
    }

    try {
      const outcome = await enrichAndRescore(target, deps, {
        runAiAnalysis: opts.runAiAnalysis,
        ...(opts.db ? { db: opts.db } : {}),
      });
      result.enriched++;
      if (!opts.postFilter || passesPostEnrichFilter(outcome.business, opts.postFilter)) {
        result.qualified++;
      }
      result.errors.push(...outcome.errors.map((e) => `${target.name}: ${e}`));
    } catch (e) {
      if (isBudgetExceeded(e)) {
        result.stoppedByBudget = true;
        result.errors.push(e.message);
        break;
      }
      // 1店舗の失敗で全体を止めない。店舗情報そのものは失われない（§12-3）
      result.errors.push(`${target.name}: ${e instanceof Error ? e.message : '不明なエラー'}`);
    }
  }

  return result;
}
