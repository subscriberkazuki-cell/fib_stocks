'use client';

import { useEffect, useState } from 'react';
import { ROUND_NAME, SCHEDULE, VERIFIED_ON } from '@/config/subsidy';
import {
  REVERIFY_AFTER_DAYS, type RoundStatus, roundStatus, shortRoundName, verificationAgeDays,
} from '@/lib/subsidy/schedule';
import { Rich } from '@/components/ui';

/**
 * 今がこの公募回のどの段階かを、営業文の近くに常に出しておく。
 *
 * **クライアント側で日付を取っているのは意図的。**
 * /playbook は静的生成されるので、サーバー側で new Date() を呼ぶと
 * ビルドした日の「あと◯日」が焼き付いて、以後ずっと同じ数字を表示し続ける。
 * それでは締切の警告として機能しない。
 *
 * 初回レンダーでは何も出さず、マウント後に実際の日付で描画する。
 * （ハイドレーションの不一致も、これで起きない）
 */
export function RoundStatusBanner(): React.ReactElement | null {
  const [state, setState] = useState<{ status: RoundStatus; verifyAge: number } | null>(null);

  useEffect(() => {
    const now = new Date();
    setState({
      status: roundStatus(SCHEDULE, now),
      verifyAge: verificationAgeDays(VERIFIED_ON, now),
    });
  }, []);

  if (!state) return null;
  const { status, verifyAge } = state;

  const tone = !status.usable
    ? 'border-red-300 bg-red-50 text-red-950'
    : status.phase === 'open'
      ? 'border-amber-300 bg-amber-50 text-amber-950'
      : 'border-stone-300 bg-stone-50 text-stone-800';

  return (
    <div className={`space-y-1 rounded-md border p-3 text-sm ${tone}`}>
      <p className="font-medium">
        {shortRoundName(ROUND_NAME)}：<Rich text={status.headline} />
      </p>
      {status.warning && (
        <p className="text-xs">
          <Rich text={status.warning} />
        </p>
      )}
      {verifyAge > REVERIFY_AFTER_DAYS && (
        <p className="text-xs">
          制度内容を確認してから{verifyAge}日経っています。
          公募要領を読み直して <code className="rounded bg-white/60 px-1">src/config/subsidy.ts</code> を更新してください。
        </p>
      )}
    </div>
  );
}
