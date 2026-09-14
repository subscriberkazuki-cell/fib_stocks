// 価格まわり。
//
// 守っているのは主に2つ。
//   1. 月額だけ見せて初年度の総額を隠さないこと（見せ方として不誠実になる）
//   2. 「無料」という打ち出しが文面に混ざらないこと（公開時に費用が発生するので景表法の有利誤認）

import { describe, expect, it } from 'vitest';
import {
  INTRO_OFFER, PRICING, SUBSIDY_NOTE, applyIntroOffer, estimatedSubsidizedCost,
  firstYearTotal, getPricing, priceLabel, yen,
} from '@/config/pricing';
import { ALL_OFFERINGS } from '@/config/offerings';
import { OUTREACH_SCRIPTS, OUTREACH_FLOW } from '@/config/outreachFlow';

describe('価格設定', () => {
  it('すべてのプランに価格がある', () => {
    for (const o of ALL_OFFERINGS) {
      expect(getPricing(o.key), `${o.name} の価格`).not.toBeNull();
    }
  });

  it('月額ありの方が入口の金額が低い（主力にする理由）', () => {
    for (const [key, p] of Object.entries(PRICING)) {
      if (!p) continue;
      expect(p.withMonthly.initial, `${key}`).toBeLessThan(p.oneTime.initial);
    }
  });

  it('買い切りには月額がない', () => {
    for (const p of Object.values(PRICING)) {
      if (!p) continue;
      expect(p.oneTime.monthly).toBe(0);
    }
  });

  it('月額がある場合、含まれるものが明記されている', () => {
    for (const [key, p] of Object.entries(PRICING)) {
      if (!p || p.withMonthly.monthly === 0) continue;
      expect(p.withMonthly.monthlyIncludes.length, `${key}`).toBeGreaterThan(5);
    }
  });

  it('1ページサイトが相場の下限を割っていない', () => {
    // フリーランスの制作費相場は10万円〜。ここを大きく割ると品質を疑われ、
    // 時給としても成立しなくなる
    const p = getPricing('site_onepage');
    expect(p?.withMonthly.initial).toBeGreaterThanOrEqual(90_000);
  });

  it('月額が相場の範囲に収まっている', () => {
    // 中小企業向けの保守相場は5,000〜30,000円
    for (const [key, p] of Object.entries(PRICING)) {
      if (!p || p.withMonthly.monthly === 0) continue;
      expect(p.withMonthly.monthly, `${key}`).toBeGreaterThanOrEqual(3_000);
      expect(p.withMonthly.monthly, `${key}`).toBeLessThanOrEqual(30_000);
    }
  });
});

describe('初年度の総額', () => {
  it('公開時 + 月額×12 で計算する', () => {
    expect(firstYearTotal({ initial: 98_000, monthly: 5_500, monthlyIncludes: '' })).toBe(164_000);
  });

  it('買い切りは公開時の金額のみ', () => {
    expect(firstYearTotal({ initial: 168_000, monthly: 0, monthlyIncludes: '' })).toBe(168_000);
  });

  it('1ページの場合、初年度は買い切りとほぼ並ぶ（どちらを選んでも損得が極端でない）', () => {
    const p = getPricing('site_onepage');
    if (!p) throw new Error('価格未設定');
    const diff = Math.abs(firstYearTotal(p.withMonthly) - p.oneTime.initial);
    expect(diff).toBeLessThan(30_000);
  });
});

describe('実績づくりの割引', () => {
  it('理由と件数が設定されている（無条件の値引きにしない）', () => {
    expect(INTRO_OFFER.reason.length).toBeGreaterThan(5);
    expect(INTRO_OFFER.limitCount).toBeGreaterThan(0);
    expect(INTRO_OFFER.condition.length).toBeGreaterThan(5);
  });

  it('割引後も1,000円単位で丸まる', () => {
    expect(applyIntroOffer(98_000) % 1000).toBe(0);
  });

  it('割引が効いている', () => {
    expect(applyIntroOffer(98_000)).toBeLessThan(98_000);
    expect(applyIntroOffer(98_000)).toBe(69_000);
  });

  it('割引しても時給が破綻しない水準に留まる', () => {
    // 1ページあたり6〜8時間。割引後でも時給8,000円は確保したい
    const discounted = applyIntroOffer(98_000);
    expect(discounted / 8).toBeGreaterThan(8_000);
  });
});

describe('補助金の扱い', () => {
  it('補助率2/3で実質負担を計算する', () => {
    expect(estimatedSubsidizedCost(98_000)).toBe(32_667);
  });

  it('上限を超える分は補助されない', () => {
    const big = 900_000;
    const covered = big - estimatedSubsidizedCost(big);
    expect(covered).toBeLessThanOrEqual(SUBSIDY_NOTE.webCap * (2 / 3) + 1);
  });

  it('単独申請できない旨が注意書きに含まれる', () => {
    expect(SUBSIDY_NOTE.caution).toContain('のみ');
    expect(SUBSIDY_NOTE.caution).toContain('保証');
  });
});

describe('文面に「無料」を使わない（景表法）', () => {
  it('条件提示のメールに実際の金額が書かれている', () => {
    const s = OUTREACH_SCRIPTS.find((x) => x.stage === 4);
    expect(s?.body).toContain('98,000');
    expect(s?.body).toContain('5,500');
    expect(s?.body).toContain('168,000');
  });

  it('「無料で作ります」と書いていない', () => {
    const all = OUTREACH_SCRIPTS.map((s) => s.body).join('\n');
    expect(all).not.toContain('無料で作');
    expect(all).not.toContain('無料でお作り');
    expect(all).not.toContain('無料で制作');
  });

  it('電話で「無料で作る」と言わないよう注意書きがある', () => {
    const never = OUTREACH_FLOW.flatMap((s) => s.never).join(' ');
    expect(never).toContain('無料で作ります');
    expect(never).toContain('景表法');
  });

  it('割引には理由と件数が書かれている', () => {
    const s = OUTREACH_SCRIPTS.find((x) => x.stage === 4);
    expect(s?.body).toContain('事例');
    expect(s?.body).toContain('5件');
  });

  it('補助金の採択を保証する書き方をしていない', () => {
    const s = OUTREACH_SCRIPTS.find((x) => x.stage === 4);
    expect(s?.body).toContain('可能性があります');
    expect(s?.body).not.toContain('必ず補助');
    expect(s?.body).not.toContain('確実に採択');
  });
});

describe('表示', () => {
  it('金額を日本円表記にする', () => {
    expect(yen(98_000)).toBe('¥98,000');
  });

  it('priceLabel に公開時と月額の両方が出る', () => {
    expect(priceLabel('site_onepage')).toContain('¥98,000');
    expect(priceLabel('site_onepage')).toContain('月額');
  });

  it('未設定のキーは「未設定」', () => {
    expect(priceLabel('存在しないキー')).toBe('未設定');
  });
});
