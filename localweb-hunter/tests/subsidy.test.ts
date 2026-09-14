// 小規模事業者持続化補助金。
//
// ここが守っているのは「店舗に嘘を伝えないこと」。
// 補助金は実際にお金が動く話で、外れると相手の資金繰りに影響する。
//   * 採択を保証する言い方をしない
//   * 交付決定前に売ると対象外になることを必ず伝える
//   * 対象外の法人格を対象扱いしない
//   * ウェブ費用のみでは申請できないことを伝える

import { describe, expect, it } from 'vitest';
import {
  ADVISORY_RULES, COMBINABLE_EXPENSES, EMPLOYEE_COUNT_RULES, INELIGIBLE_ENTITIES,
  SUBSIDY, SUBSIDY_CONFLICT, TRACKS, TRACK_RECORD, VERIFIED_ON,
  costAtWebCap, estimateSubsidy, screenEligibility,
} from '@/config/subsidy';
import { SUBSIDY_SCRIPTS } from '@/config/outreachFlow';

describe('補助額の計算', () => {
  it('補助率2/3で計算する', () => {
    expect(estimateSubsidy(98_000).subsidized).toBe(65_333);
    expect(estimateSubsidy(98_000).outOfPocket).toBe(32_667);
  });

  it('赤字事業者は3/4', () => {
    expect(estimateSubsidy(98_000, true).subsidized).toBe(73_500);
  });

  it('ウェブ関連費の上限30万円を超えない', () => {
    const big = estimateSubsidy(1_000_000);
    expect(big.subsidized).toBe(SUBSIDY.webCap);
    expect(big.cappedByWebLimit).toBe(true);
  });

  it('上限に達する制作費を計算できる（これ以上かけても補助は増えない）', () => {
    expect(costAtWebCap()).toBe(450_000);
    expect(estimateSubsidy(costAtWebCap()).cappedByWebLimit).toBe(false);
  });

  it('通常の価格帯では上限に当たらない', () => {
    for (const cost of [78_000, 98_000, 128_000, 198_000, 298_000]) {
      expect(estimateSubsidy(cost).cappedByWebLimit, `${cost}円`).toBe(false);
    }
  });
});

describe('対象判定', () => {
  it('飲食店は対象になり得る（従業員5人以下）', () => {
    const r = screenEligibility('飲食店', 'さくら食堂');
    expect(r.status).toBe('likely_eligible');
    expect(r.employeeLimit.limit).toBe(5);
  });

  it('工務店は従業員20人まで', () => {
    expect(screenEligibility('工務店・リフォーム', '山田工務店').employeeLimit.limit).toBe(20);
  });

  it('宿泊業は20人まで（商業・サービス業から除かれている）', () => {
    expect(screenEligibility('宿泊', '柏ホテル').employeeLimit.limit).toBe(20);
  });

  it('クリニックは「要確認」にする（医療法人は対象外のため）', () => {
    const r = screenEligibility('クリニック・歯科', 'さくら歯科');
    expect(r.status).toBe('needs_check');
    expect(r.reasons.join('')).toContain('医療法人');
    expect(r.toConfirm[0]).toContain('法人格');
  });

  it('店名に対象外の法人格が出ていれば「対象外」と判定する', () => {
    expect(screenEligibility('飲食店', '医療法人さくら会 食堂').status).toBe('likely_ineligible');
    expect(screenEligibility('小売店', '宗教法人 さくら').status).toBe('likely_ineligible');
  });

  it('対象外判定のときは確認事項を出さない（話を持ち出さないため）', () => {
    expect(screenEligibility('飲食店', '学校法人さくら学園 売店').toConfirm).toEqual([]);
  });

  it('どの業種でも従業員数の確認を促す', () => {
    for (const cat of ['飲食店', '美容室・理容室', '整体・リラクゼーション', '士業・専門サービス']) {
      const r = screenEligibility(cat, 'テスト店');
      expect(r.toConfirm.join(''), cat).toContain('従業員');
    }
  });
});

describe('対象外の法人格', () => {
  it('制度上の対象外が列挙されている', () => {
    const all = INELIGIBLE_ENTITIES.join(' ');
    for (const e of ['医療法人', '学校法人', '宗教法人', '農業法人', '任意団体']) {
      expect(all, e).toContain(e);
    }
  });

  it('列挙されたものはすべて対象外と判定される', () => {
    for (const entity of INELIGIBLE_ENTITIES) {
      const core = entity.split('（')[0] ?? entity;
      // 風俗営業等は店名から判定できないので、判定可能な法人格のみ確認する
      if (!core.includes('法人') && !core.includes('団体')) continue;
      expect(screenEligibility('飲食店', `${core}テスト`).status, core).toBe('likely_ineligible');
    }
  });
});

describe('従業員数の数え方', () => {
  it('個人事業主本人と非兼務役員を数えない', () => {
    const ex = EMPLOYEE_COUNT_RULES.excluded.join(' ');
    expect(ex).toContain('個人事業主本人');
    expect(ex).toContain('会社役員');
    expect(ex).toContain('同居の親族');
  });

  it('継続雇用のパート・アルバイトと兼務役員は数える', () => {
    const inc = EMPLOYEE_COUNT_RULES.included.join(' ');
    expect(inc).toContain('パート');
    expect(inc).toContain('兼務');
  });
});

describe('先出しモデルとの衝突', () => {
  it('交付決定前の発注が対象外になることを記載している', () => {
    expect(SUBSIDY_CONFLICT.problem).toContain('交付決定');
    expect(SUBSIDY_CONFLICT.problem).toContain('さかのぼ');
  });

  it('解決策（提案資料として扱う）が示されている', () => {
    expect(SUBSIDY_CONFLICT.solution).toContain('提案資料');
  });

  it('2つのトラックが定義され、補助金トラックは受注を後ろに置いている', () => {
    expect(TRACKS).toHaveLength(2);
    const subsidy = TRACKS.find((t) => t.key === 'subsidy');
    expect(subsidy).toBeDefined();
    const orderStep = subsidy!.flow.findIndex((f) => f.includes('正式発注'));
    const decisionStep = subsidy!.flow.findIndex((f) => f.includes('交付決定'));
    expect(decisionStep).toBeGreaterThanOrEqual(0);
    expect(orderStep).toBeGreaterThan(decisionStep);
  });

  it('通常トラックには「あとから補助金にできない」と書いてある', () => {
    const immediate = TRACKS.find((t) => t.key === 'immediate');
    expect(immediate?.caution).toContain('補助金の対象にはできない');
  });
});

describe('案内するときの注意', () => {
  it('採択を保証しないルールがある', () => {
    expect(ADVISORY_RULES.join(' ')).toContain('保証');
  });

  it('可否を自分で判定しないルールがある', () => {
    expect(ADVISORY_RULES.join(' ')).toContain('商工会議所');
  });

  it('確認日が記録されている（制度が変わるため）', () => {
    expect(VERIFIED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ADVISORY_RULES.join(' ')).toContain(VERIFIED_ON);
  });

  it('組み合わせられる経費の例が用意されている', () => {
    expect(COMBINABLE_EXPENSES.length).toBeGreaterThan(3);
    for (const e of COMBINABLE_EXPENSES) {
      expect(e.example.length).toBeGreaterThan(3);
    }
  });
});

describe('文面', () => {
  it('交付決定前に発注すると対象外になることを先に伝えている', () => {
    const all = SUBSIDY_SCRIPTS.map((s) => s.body).join('\n');
    expect(all).toContain('交付決定');
    expect(all).toContain('さかのぼ');
  });

  it('採択を保証する書き方をしていない', () => {
    const all = SUBSIDY_SCRIPTS.map((s) => s.body).join('\n');
    expect(all).not.toContain('必ず採択');
    expect(all).not.toContain('確実に通り');
    expect(all).not.toContain('必ず補助金が');
    // 採択率に触れて期待値を下げている
    expect(all).toContain('5割弱');
  });

  it('様式4の締切が申請締切より早いことを伝えている', () => {
    const all = SUBSIDY_SCRIPTS.map((s) => s.body).join('\n');
    expect(all).toContain('様式4');
    expect(all).toContain('12月4日');
  });

  it('ウェブ費用だけでは申請できないことを伝えている', () => {
    const all = SUBSIDY_SCRIPTS.map((s) => s.body).join('\n');
    expect(all).toContain('ウェブ費用だけでは申請できません');
  });

  it('後払いで1年程度かかることを伝えている', () => {
    const all = SUBSIDY_SCRIPTS.map((s) => s.body).join('\n');
    expect(all).toContain('精算払い');
    expect(all).toContain('1年程度');
  });

  it('可否は自分で判断しないと明示している', () => {
    const all = SUBSIDY_SCRIPTS.map((s) => s.body).join('\n');
    expect(all).toContain('商工会議所');
    expect(all).toContain('可否を判断できません');
  });

  it('「今すぐ作る」選択肢も残している（補助金を押し付けない）', () => {
    const all = SUBSIDY_SCRIPTS.map((s) => s.body).join('\n');
    expect(all).toContain('今作りたい');
  });
});

describe('採択率', () => {
  it('第19回の実績から計算される', () => {
    expect(TRACK_RECORD.applications).toBe(16_576);
    expect(TRACK_RECORD.adopted).toBe(7_819);
    expect(TRACK_RECORD.rate).toBeCloseTo(0.472, 2);
  });

  it('半分以下であることを前提に案内する（楽観しない）', () => {
    expect(TRACK_RECORD.rate).toBeLessThan(0.5);
  });
});
