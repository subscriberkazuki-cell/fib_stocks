// 補助金申請サポート事業。
//
// ここが守っているのは3つ。
//   1. **行政書士法の独占業務に踏み込まないこと。** 2026年1月の改正で、報酬を得て
//      申請書類を作成することは行政書士の独占業務になった。実態で判断されるので、
//      「書かない」という設計をコードの側で固定しておく。
//   2. **無料の公式窓口（商工会議所・商工会）を先に案内すること。** 自分の有料サービスを
//      先に出すと、店舗の不利益になるうえ信用も失う。
//   3. **見合わないサポートを売らないこと。** HP費用だけの申請では補助金がサポート料に
//      見合わない。そこを数値で判定できるようにしてある。

import { describe, expect, it } from 'vitest';
import {
  BOUNDARY_RULES, LEGAL_BOUNDARY, OFFICIAL_WINDOW, PRICING_POLICY,
  REFER_TO_SPECIALIST, SUPPORT_SERVICES,
  isSupportWorthwhile, minimumSubsidyForSupport,
} from '@/config/subsidySupport';
import {
  PSYCHOLOGY_NOTES, SUBSIDY_OBJECTIONS, SUBSIDY_SUPPORT_SCRIPTS,
} from '@/config/subsidyOutreach';
import { PROSPECT_LABELS, scoreSubsidyProspect } from '@/lib/scoring/subsidyScore';
import { SCHEDULE, TRACK_RECORD, estimateSubsidy } from '@/config/subsidy';
import { getPricing } from '@/config/pricing';
import { computeNextAction } from '@/lib/scoring/nextAction';
import type { Business } from '@/types/business';
import { sourced } from '@/types/business';

function biz(over: Partial<Business> = {}): Business {
  const now = new Date().toISOString();
  return {
    id: 'b1', source: 't', sourceBusinessId: 's1',
    name: 'テスト店', category: '飲食店', address: '', prefecture: '', city: '',
    latitude: null, longitude: null,
    phone: sourced('04-7167-1111', 'business_data_provider'),
    email: null, rating: sourced(4.5, 'business_data_provider'),
    reviewCount: sourced(100, 'business_data_provider'),
    websiteUrl: null, websiteStatus: 'none', webPresenceScore: 100,
    websiteOpportunityScore: 100, websiteSignals: null, candidateUrls: [], socialUrls: [],
    googleMapsUrl: null, openingHours: null,
    leadScore: 80, leadScoreBreakdown: null, salesPriority: 'A', salesAnalysis: null,
    regulatoryNotes: [], leadStatus: '未接触', nextAction: null, lastContactedAt: null,
    nextContactAt: null, salesNotes: null, dealValue: null,
    phase2CompletedAt: null, lastCheckedAt: null, createdAt: now, updatedAt: now,
    ...over,
  };
}

const ALL_SCRIPT_TEXT = SUBSIDY_SUPPORT_SCRIPTS.map((s) => `${s.body}\n${s.note}`).join('\n');
const FIRST_CONTACT = SUBSIDY_SUPPORT_SCRIPTS.filter((s) => s.stage === 1);
const SPARRING = SUPPORT_SERVICES.find((s) => s.key === 'plan_sparring')!;

// ============================================================
describe('法的な境界線（行政書士法）', () => {
  it('根拠法と罰則が記録されている', () => {
    expect(LEGAL_BOUNDARY.law).toContain('行政書士法');
    expect(LEGAL_BOUNDARY.penalty).toContain('罰金');
  });

  it('名目ではなく実態で判断されることを明記している', () => {
    // 「コンサル契約にすれば大丈夫」という抜け道を潰しておく
    expect(LEGAL_BOUNDARY.judgedBy).toContain('実態');
    expect(LEGAL_BOUNDARY.judgedBy).toContain('顧問契約');
  });

  it('店舗側にもリスクが及ぶことを書いてある', () => {
    // 自分だけの問題ではないので、ここを軽く見せない
    expect(LEGAL_BOUNDARY.clientRisk).toContain('返還');
  });

  it('申請書類の作成は禁止側に分類されている', () => {
    const forbidden = BOUNDARY_RULES.filter((r) => !r.allowed).map((r) => r.action).join(' / ');
    expect(forbidden).toContain('下書き');
    expect(forbidden).toContain('打ち込む'); // 口述筆記も代筆にあたる
    expect(forbidden).toContain('添削');
    expect(forbidden).toContain('経費明細');
  });

  it('禁止の項目には理由が書かれている（判断に使えるように）', () => {
    const forbidden = BOUNDARY_RULES.filter((x) => !x.allowed);
    expect(forbidden.length).toBeGreaterThanOrEqual(4);
    for (const r of forbidden) {
      expect(r.why.length, r.action).toBeGreaterThan(10);
    }
  });

  it('許可される側は情報提供・助言に収まっている', () => {
    const allowed = BOUNDARY_RULES.filter((r) => r.allowed);
    expect(allowed.length).toBeGreaterThanOrEqual(4);
    // 「作成」「代筆」を許可側に入れてしまっていないこと
    for (const r of allowed) {
      expect(r.action, r.action).not.toContain('下書き');
      expect(r.action, r.action).not.toContain('代筆');
    }
  });

  it('壁打ちは許可だが「書いたら違反」という但し書きがある', () => {
    const sparring = BOUNDARY_RULES.find((r) => r.action.includes('壁打ち'));
    expect(sparring?.allowed).toBe(true);
    expect(sparring?.why).toContain('アウト');
  });

  it('行政書士へ引き継ぐ条件が定義されている', () => {
    expect(REFER_TO_SPECIALIST.length).toBeGreaterThan(2);
    expect(REFER_TO_SPECIALIST.join(' ')).toContain('代わりに書いてほしい');
  });
});

// ============================================================
describe('公式窓口との関係', () => {
  it('様式4は商工会議所でしか出せないことを把握している', () => {
    expect(OFFICIAL_WINDOW.canDo.join(' ')).toContain('様式4');
  });

  it('無料相談ができることを把握している（自分より先に案内するため）', () => {
    expect(OFFICIAL_WINDOW.canDo.join(' ')).toContain('無料');
  });

  it('公式窓口で手が回らない範囲が具体的に洗い出されている', () => {
    // ここが空だと「補完する事業」という前提が成り立たない
    expect(OFFICIAL_WINDOW.hardToGet.length).toBeGreaterThan(3);
  });

  it('有料サービスはすべて公式窓口の不足を埋める形になっている', () => {
    for (const s of SUPPORT_SERVICES) {
      expect(s.fills.length, s.name).toBeGreaterThan(10);
    }
  });
});

// ============================================================
describe('提供サービス', () => {
  it('診断は無料（最初の接触で金を取らない）', () => {
    expect(SUPPORT_SERVICES.find((s) => s.key === 'diagnosis')?.price).toBe(0);
  });

  it('すべてのサービスに、独占業務に触れないことの確認が付いている', () => {
    for (const s of SUPPORT_SERVICES) {
      expect(s.legalNote.length, s.name).toBeGreaterThan(10);
    }
  });

  it('壁打ちには「こちらは書かない」と明記されている', () => {
    expect(SPARRING.legalNote).toContain('書かない');
  });

  it('成果物に「作成」「代行」を約束していない', () => {
    for (const s of SUPPORT_SERVICES) {
      for (const d of s.deliverables) {
        expect(d, `${s.name}: ${d}`).not.toMatch(/申請書.*作成|書類.*作成|代筆|代行/);
      }
    }
  });

  it('成功報酬型を採らない（独占業務に踏み込む圧力を作らないため）', () => {
    expect(PRICING_POLICY.model).toContain('定額');
    expect(PRICING_POLICY.model).toContain('成功報酬は採らない');
    expect(PRICING_POLICY.reason).toContain('独占業務');
  });
});

// ============================================================
describe('サポートの経済性', () => {
  it('HP費用だけの申請では、有料サポートを勧めない', () => {
    // ¥98,000 × 2/3 = ¥65,333。そこから¥49,800を払うと手取りは¥15,533しか残らない
    const webOnly = estimateSubsidy(98_000).subsidized;
    expect(webOnly).toBe(65_333);
    expect(isSupportWorthwhile(webOnly, SPARRING.price!)).toBe(false);
  });

  it('補助額がサポート料の2倍以上あれば勧めてよい', () => {
    expect(isSupportWorthwhile(99_600, 49_800)).toBe(true);
    expect(isSupportWorthwhile(99_599, 49_800)).toBe(false);
  });

  it('上限いっぱいの申請なら十分に見合う', () => {
    expect(isSupportWorthwhile(300_000, SPARRING.price!)).toBe(true);
  });

  it('損益分岐点はサポート料の2倍', () => {
    expect(minimumSubsidyForSupport(49_800)).toBe(99_600);
    expect(isSupportWorthwhile(minimumSubsidyForSupport(49_800), 49_800)).toBe(true);
  });
});

// ============================================================
describe('見込み選定', () => {
  it('対象外の法人格は ineligible にして、確認事項も出さない', () => {
    const r = scoreSubsidyProspect(biz({ name: '医療法人さくら会 クリニック', category: 'クリニック・歯科' }));
    expect(r.prospect).toBe('ineligible');
    expect(r.score).toBe(0);
    expect(r.toAsk).toEqual([]);
    // 話を持ち出さないので、サポートの勧誘もしない
    expect(r.supportWorthwhile).toBe(false);
  });

  it('評価が高くHPがない店は見込みが高い', () => {
    const r = scoreSubsidyProspect(
      biz({ rating: sourced(4.6, 'business_data_provider'), reviewCount: sourced(180, 'business_data_provider'), websiteStatus: 'none' })
    );
    expect(r.prospect).toBe('high');
    expect(r.factors.map((f) => f.label)).toContain('公式サイトがない');
  });

  it('法人格の確認が要る業種は、点数が高くても「要確認」に留める', () => {
    // 医療法人かどうかで結論が変わるので、高見込み扱いにしてはいけない
    const r = scoreSubsidyProspect(
      biz({ category: 'クリニック・歯科', name: 'さくら歯科', rating: sourced(4.8, 'business_data_provider'), reviewCount: sourced(200, 'business_data_provider') })
    );
    expect(r.eligibility).toBe('needs_check');
    expect(r.prospect).toBe('medium');
    expect(r.toAsk.join(' ')).toContain('法人格');
  });

  it('どの店でも「他に投資予定はないか」を必ず聞く', () => {
    // ウェブ単独では申請できず、HP費用だけでは補助額がサポート料に見合わない。
    // この質問の答えで話の組み立てが決まる。
    for (const cat of ['飲食店', '美容室・理容室', '工務店・リフォーム', '小売店']) {
      const r = scoreSubsidyProspect(biz({ category: cat }));
      expect(r.toAsk.join(' '), cat).toContain('ほかに投資を考えているもの');
    }
  });

  it('従業員数の上限は業種で切り替わる', () => {
    const food = scoreSubsidyProspect(biz({ category: '飲食店' }));
    const builder = scoreSubsidyProspect(biz({ category: '工務店・リフォーム' }));
    expect(food.factors.map((f) => f.label)).toContain('従業員数の上限が5人');
    expect(builder.factors.map((f) => f.label)).toContain('従業員数の上限が20人');
  });

  it('サポートの採算は、提案するプランの金額で変わる', () => {
    // 1ページ（¥98,000）だと補助は約¥65,000。サポート料を引くと店舗にほとんど残らない。
    const onepage = scoreSubsidyProspect(biz({ category: '小売店', websiteStatus: 'none' }));
    expect(onepage.subsidyOnWebOnly).toBe(65_333);
    expect(onepage.subsidyOnWebOnly).toBeLessThan(onepage.supportBreakEven);
    expect(onepage.supportWorthwhile).toBe(false);

    // 標準サイト（¥198,000）なら補助は約¥132,000。サポート料を払っても残る。
    const standard = scoreSubsidyProspect(biz({ category: '飲食店', websiteStatus: 'none' }));
    expect(standard.subsidyOnWebOnly).toBe(132_000);
    expect(standard.supportWorthwhile).toBe(true);
  });

  it('見込み額はサイトプランの価格と補助率から出ている（独自計算をしない）', () => {
    const r = scoreSubsidyProspect(biz({ category: '飲食店', websiteStatus: 'none' }));
    const plan = getPricing(computeNextAction(biz({ category: '飲食店', websiteStatus: 'none' })).primary!.key);
    expect(r.subsidyOnWebOnly).toBe(estimateSubsidy(plan!.withMonthly.initial).subsidized);
  });

  it('スコアは0〜100に収まる', () => {
    for (const cat of ['飲食店', 'クリニック・歯科', '工務店・リフォーム', '整体・リラクゼーション']) {
      for (const st of ['none', 'official_good', 'official_low_quality', 'sns_only'] as const) {
        const r = scoreSubsidyProspect(biz({ category: cat, websiteStatus: st }));
        expect(r.score, `${cat}/${st}`).toBeGreaterThanOrEqual(0);
        expect(r.score, `${cat}/${st}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('見込み区分にはすべて表示ラベルがある', () => {
    for (const k of ['high', 'medium', 'low', 'ineligible'] as const) {
      expect(PROSPECT_LABELS[k].label.length).toBeGreaterThan(1);
    }
  });
});

// ============================================================
describe('営業文', () => {
  it('最初の接触では、自分の有料サービスより先に商工会議所を案内している', () => {
    expect(FIRST_CONTACT.length).toBeGreaterThan(0);
    for (const s of FIRST_CONTACT) {
      const official = s.body.indexOf('商工会議所');
      const mine = s.body.indexOf('無料でお出しできます');
      expect(official, s.label).toBeGreaterThanOrEqual(0);
      expect(mine, s.label).toBeGreaterThan(official);
    }
  });

  it('最初の接触で、HP制作をしている利益相反を自分から開示している', () => {
    expect(FIRST_CONTACT.length).toBeGreaterThan(0);
    for (const s of FIRST_CONTACT) {
      expect(s.body, s.label).toContain('利害関係');
    }
  });

  it('有料サービスを提示する文面には、必ず商工会議所の案内も入っている', () => {
    const priced = SUBSIDY_SUPPORT_SCRIPTS.filter((x) => x.body.includes('49,800'));
    expect(priced.length).toBeGreaterThan(0);
    for (const s of priced) {
      expect(s.body, s.label).toContain('商工会議所');
    }
  });

  it('有料提案は、公式窓口に行ったあとの段階に置かれている', () => {
    const paid = SUBSIDY_SUPPORT_SCRIPTS.find((s) => s.body.includes('49,800'))!;
    expect(FIRST_CONTACT.length).toBeGreaterThan(0);
    expect(paid.stage).toBeGreaterThan(Math.max(...FIRST_CONTACT.map((s) => s.stage)));
  });

  it('採択を保証していない', () => {
    expect(ALL_SCRIPT_TEXT).not.toContain('必ず採択');
    expect(ALL_SCRIPT_TEXT).not.toContain('確実に通り');
    expect(ALL_SCRIPT_TEXT).not.toContain('採択されます');
    expect(ALL_SCRIPT_TEXT).toContain('採択を保証することはできません');
  });

  it('採択率を実績どおりに伝えている（楽観させない）', () => {
    expect(ALL_SCRIPT_TEXT).toContain(TRACK_RECORD.applications.toLocaleString());
    expect(ALL_SCRIPT_TEXT).toContain(TRACK_RECORD.adopted.toLocaleString());
    expect(TRACK_RECORD.rate).toBeLessThan(0.5);
  });

  it('書類作成はしないことを、契約前に明示している', () => {
    const before = SUBSIDY_SUPPORT_SCRIPTS.filter((s) => s.stage <= 3).map((s) => s.body).join('\n');
    expect(before).toContain('行政書士の独占業務');
    expect(before).toContain('ご自身で書いて');
  });

  it('代筆を希望されたら行政書士を紹介すると書いてある', () => {
    expect(ALL_SCRIPT_TEXT).toContain('行政書士の方をご紹介');
  });

  it('費用に見合わない場合は勧めないと自分から書いている', () => {
    const paid = SUBSIDY_SUPPORT_SCRIPTS.find((s) => s.body.includes('49,800'))!;
    expect(paid.body).toContain('サポート料を払う意味は薄い');
    expect(paid.body).toContain('商工会議所だけで進められた方が');
  });

  it('様式4の締切が申請締切より早いことを、日付付きで伝えている', () => {
    const [, m, d] = SCHEDULE.form4Deadline.split('-');
    expect(ALL_SCRIPT_TEXT).toContain(`${Number(m)}月${Number(d)}日`);
    expect(ALL_SCRIPT_TEXT).toContain('様式4');
    expect(new Date(SCHEDULE.form4Deadline).getTime())
      .toBeLessThan(new Date(SCHEDULE.applicationCloses).getTime());
  });

  it('ウェブ費用だけでは申請できないことを伝えている', () => {
    expect(ALL_SCRIPT_TEXT).toContain('ウェブサイトの費用だけでは申請できません');
  });

  it('交付決定前に発注すると対象外になることを、受注前に伝えている', () => {
    const paid = SUBSIDY_SUPPORT_SCRIPTS.find((s) => s.body.includes('49,800'))!;
    expect(paid.body).toContain('交付決定より前に発注');
    const last = SUBSIDY_SUPPORT_SCRIPTS.at(-1)!;
    expect(last.body).toContain('交付決定の日より前に発注');
  });

  it('後払いであることを伝えている', () => {
    expect(ALL_SCRIPT_TEXT).toContain('入金まで1年程度');
    expect(ALL_SCRIPT_TEXT).toContain('いったん全額');
  });

  it('メールには特定電子メール法で必要な表示が入っている', () => {
    const mails = FIRST_CONTACT.filter((x) => x.channel === 'メール');
    expect(mails.length).toBeGreaterThan(0);
    for (const s of mails) {
      expect(s.body, s.label).toContain('【住所】');
      expect(s.body, s.label).toContain('配信をご希望されない場合');
    }
  });

  it('商工会議所の電話番号は自分で確認するよう注意書きがある', () => {
    const withTel = SUBSIDY_SUPPORT_SCRIPTS.find((s) => s.body.includes('04-7162-3325'))!;
    expect(withTel.body).toContain('ご確認ください');
    expect(withTel.note).toContain('必ず自分で確認');
  });

  it('すべての文面に、運用上の注意が付いている', () => {
    for (const s of SUBSIDY_SUPPORT_SCRIPTS) {
      expect(s.note.length, s.label).toBeGreaterThan(20);
    }
  });
});

// ============================================================
describe('心理設計', () => {
  it('偽の緊急性を使わないと明記されている', () => {
    const urgency = PSYCHOLOGY_NOTES.find((p) => p.principle.includes('締切'))!;
    expect(urgency.why).toContain('偽の緊急性は');
    expect(urgency.how).toContain('様式4');
  });

  it('無料の窓口を先に教えることが原則に入っている', () => {
    expect(PSYCHOLOGY_NOTES.map((p) => p.how).join(' ')).toContain('商工会議所');
  });

  it('利益相反の開示が原則に入っている', () => {
    expect(PSYCHOLOGY_NOTES.map((p) => p.principle).join(' ')).toContain('利益相反');
  });

  it('各原則に「なぜ効くか」と「どう言うか」が両方ある', () => {
    for (const p of PSYCHOLOGY_NOTES) {
      expect(p.why.length, p.principle).toBeGreaterThan(15);
      expect(p.how.length, p.principle).toBeGreaterThan(15);
    }
  });
});

// ============================================================
describe('断られたとき', () => {
  it('すべての反論に「引き際」が定義されている', () => {
    for (const o of SUBSIDY_OBJECTIONS) {
      expect(o.stopIf.length, o.said).toBeGreaterThan(5);
    }
  });

  it('詐欺を疑われたら、自分を経由しない道を示す', () => {
    const doubt = SUBSIDY_OBJECTIONS.find((o) => o.said.includes('詐欺'))!;
    expect(doubt.response).toContain('商工会議所');
    expect(doubt.stopIf).toContain('追わない');
  });

  it('既に支援者がいる相手は奪いに行かない', () => {
    const cpa = SUBSIDY_OBJECTIONS.find((o) => o.said.includes('税理士'))!;
    expect(cpa.response).toContain('奪いに行かない');
  });
});
