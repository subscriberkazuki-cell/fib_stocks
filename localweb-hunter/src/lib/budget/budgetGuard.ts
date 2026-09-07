// 予算ガード（§2-1）
//
// 設計の要点：**課金される外部API呼び出しは、必ず spend() の中で実行する。**
// 「呼ぶ前にチェックする」だけの実装だと、後からモジュールが増えたときに
// チェックを忘れた経路ができる。呼び出し自体をこの関数が包むことで、
// 記録漏れと未チェックの両方を構造的に防いでいる。
//
// 超過時は警告ではなく例外を投げて停止する。仕様上、警告表示だけでは不可。

export class BudgetExceededError extends Error {
  readonly kind = 'BUDGET_EXCEEDED';
  constructor(
    message: string,
    readonly detail: { limitUsd: number; spentUsd: number; attemptedUsd: number; scope: 'monthly' | 'per_search' }
  ) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export interface BudgetLimits {
  monthlyUsd: number;
  perSearchUsd: number;
}

/** 使用量の読み書き。DB実装とテスト用のインメモリ実装を差し替えられるようにしてある */
export interface UsageRecorder {
  getMonthlySpend(): number;
  record(entry: {
    kind: 'business_data' | 'web_search' | 'ai' | 'crawler';
    provider: string;
    requestCount: number;
    itemCount: number;
    costUsd: number;
    jobId: string | null;
    note: string | null;
  }): void;
}

export interface SpendRequest<T> {
  kind: 'business_data' | 'web_search' | 'ai' | 'crawler';
  provider: string;
  /** 呼び出し前に見積もる最大コスト。これで事前チェックする */
  estimatedCostUsd: number;
  jobId?: string | null;
  note?: string | null;
  /**
   * 実際の外部API呼び出し。
   * 戻り値の actualCostUsd が分かる場合はそれを記録し、
   * 分からない場合は estimatedCostUsd を使う。
   */
  run: () => Promise<{ value: T; actualCostUsd?: number; requestCount?: number; itemCount?: number }>;
}

export class BudgetGuard {
  /** この BudgetGuard インスタンスで使った累計（1回の検索セッション内の上限判定用） */
  private sessionSpendUsd = 0;

  constructor(
    private readonly limits: BudgetLimits,
    private readonly usage: UsageRecorder
  ) {}

  get sessionSpend(): number {
    return this.sessionSpendUsd;
  }

  /** UI表示用。例外は投げない */
  status(): { monthlySpent: number; monthlyLimit: number; monthlyRemaining: number; sessionSpent: number; perSearchLimit: number } {
    const monthlySpent = this.usage.getMonthlySpend();
    return {
      monthlySpent,
      monthlyLimit: this.limits.monthlyUsd,
      monthlyRemaining: Math.max(0, this.limits.monthlyUsd - monthlySpent),
      sessionSpent: this.sessionSpendUsd,
      perSearchLimit: this.limits.perSearchUsd,
    };
  }

  /**
   * 課金呼び出しを行う唯一の入口。
   * 予算を超える見込みなら run() を実行せずに例外を投げる。
   */
  async spend<T>(req: SpendRequest<T>): Promise<T> {
    this.assertWithinBudget(req.estimatedCostUsd);

    const result = await req.run();
    const actual = result.actualCostUsd ?? req.estimatedCostUsd;

    this.sessionSpendUsd += actual;
    this.usage.record({
      kind: req.kind,
      provider: req.provider,
      requestCount: result.requestCount ?? 1,
      itemCount: result.itemCount ?? 0,
      costUsd: actual,
      jobId: req.jobId ?? null,
      note: req.note ?? null,
    });

    return result.value;
  }

  /**
   * 事前チェックのみ。次のサブクエリに進んでよいかの判定に使う。
   * spend() も内部でこれを呼ぶので、二重に呼ぶ必要はない。
   */
  assertWithinBudget(attemptedUsd: number): void {
    if (attemptedUsd < 0 || !Number.isFinite(attemptedUsd)) {
      throw new Error(`不正な推定コストです: ${attemptedUsd}`);
    }

    if (this.sessionSpendUsd + attemptedUsd > this.limits.perSearchUsd) {
      throw new BudgetExceededError(
        `1回の検索の上限 $${this.limits.perSearchUsd} を超えるため停止しました` +
          `（この検索での使用額 $${this.sessionSpendUsd.toFixed(4)} + 今回 $${attemptedUsd.toFixed(4)}）。` +
          `PER_SEARCH_BUDGET_USD を見直すか、検索範囲を狭めてください。`,
        { limitUsd: this.limits.perSearchUsd, spentUsd: this.sessionSpendUsd, attemptedUsd, scope: 'per_search' }
      );
    }

    const monthlySpent = this.usage.getMonthlySpend();
    if (monthlySpent + attemptedUsd > this.limits.monthlyUsd) {
      throw new BudgetExceededError(
        `月間予算 $${this.limits.monthlyUsd} を超えるため、外部API呼び出しを停止しました` +
          `（今月の使用額 $${monthlySpent.toFixed(4)} + 今回 $${attemptedUsd.toFixed(4)}）。` +
          `MONTHLY_BUDGET_USD を見直すまで課金される呼び出しは行いません。`,
        { limitUsd: this.limits.monthlyUsd, spentUsd: monthlySpent, attemptedUsd, scope: 'monthly' }
      );
    }
  }

  /** 例外を投げずに可否だけ知りたい場合（UIの事前表示用） */
  canSpend(attemptedUsd: number): boolean {
    try {
      this.assertWithinBudget(attemptedUsd);
      return true;
    } catch {
      return false;
    }
  }
}

export function isBudgetExceeded(e: unknown): e is BudgetExceededError {
  return e instanceof BudgetExceededError;
}
