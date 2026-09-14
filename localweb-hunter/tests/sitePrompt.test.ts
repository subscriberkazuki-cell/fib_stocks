// サイト制作プロンプトの生成。
//
// 守っているのは「AIに渡した時点で事故らないこと」。
// 具体的には、実データに無い情報を書かせない指示と、
// 業種ごとの規制表現の禁止が、必ずプロンプトに含まれていること。

import { describe, expect, it } from 'vitest';
import { buildSitePrompt } from '@/lib/prompt/sitePrompt';
import { SITE_DESIGNS, findSiteDesign } from '@/config/siteDesign';
import { CATEGORY_PRESETS } from '@/config/defaults';
import { OUTREACH_FLOW, OUTREACH_SCRIPTS } from '@/config/outreachFlow';
import type { Business } from '@/types/business';
import { sourced } from '@/types/business';

function biz(over: Partial<Business> = {}): Business {
  const now = new Date().toISOString();
  return {
    id: 'b1', source: 't', sourceBusinessId: 's1',
    name: 'さくら整体院', category: '整体・リラクゼーション',
    address: '千葉県柏市旭町1-2-3', prefecture: '千葉県', city: '柏市',
    latitude: 35.86, longitude: 139.97,
    phone: sourced('04-7167-1111', 'business_data_provider'),
    email: null,
    rating: sourced(4.7, 'business_data_provider'),
    reviewCount: sourced(238, 'business_data_provider'),
    websiteUrl: null, websiteStatus: 'none', webPresenceScore: 100,
    websiteOpportunityScore: 100, websiteSignals: null, candidateUrls: [], socialUrls: [],
    googleMapsUrl: null, openingHours: '10:00-20:00',
    leadScore: 87, leadScoreBreakdown: null, salesPriority: 'S', salesAnalysis: null,
    regulatoryNotes: [], leadStatus: '未接触', nextAction: null, lastContactedAt: null,
    nextContactAt: null, salesNotes: null, dealValue: null,
    phase2CompletedAt: null, lastCheckedAt: null, createdAt: now, updatedAt: now,
    ...over,
  };
}

describe('実データの埋め込み', () => {
  it('店舗の実データがプロンプトに入る', () => {
    const p = buildSitePrompt(biz());
    expect(p).toContain('さくら整体院');
    expect(p).toContain('千葉県柏市旭町1-2-3');
    expect(p).toContain('04-7167-1111');
    expect(p).toContain('4.7');
    expect(p).toContain('238');
  });

  it('不明な項目は「推測して書かないこと」と明示する', () => {
    // 空欄で渡すとAIがそれらしく埋めてしまうので、不明であることを明示する
    const p = buildSitePrompt(biz({ openingHours: null, phone: null }));
    expect(p).toContain('推測して書かないこと');
  });

  it('捏造の禁止が必ず含まれる', () => {
    const p = buildSitePrompt(biz());
    expect(p).toContain('捏造の禁止');
    expect(p).toContain('顧客の声');
    expect(p).toContain('受賞歴');
  });
});

describe('業種別の指定', () => {
  it('業種ごとに配色が変わる', () => {
    const seitai = buildSitePrompt(biz({ category: '整体・リラクゼーション' }));
    const gym = buildSitePrompt(biz({ category: 'ジム・フィットネス' }));
    const seitaiDesign = findSiteDesign('整体・リラクゼーション');
    const gymDesign = findSiteDesign('ジム・フィットネス');

    expect(seitai).toContain(seitaiDesign?.palette.accent ?? '');
    expect(gym).toContain(gymDesign?.palette.accent ?? '');
    expect(seitaiDesign?.palette.bg).not.toBe(gymDesign?.palette.bg);
  });

  it('整体院には法令上の禁止表現が入る', () => {
    const p = buildSitePrompt(biz({ category: '整体・リラクゼーション' }));
    expect(p).toContain('治る');
    expect(p).toContain('柔道整復師法');
  });

  it('クリニックには医療広告ガイドラインの禁止事項が入る', () => {
    const p = buildSitePrompt(biz({ category: 'クリニック・歯科' }));
    expect(p).toContain('医療広告ガイドライン');
    expect(p).toContain('ビフォーアフター');
  });

  it('業種表にない店舗でも、事実と禁止事項だけは渡す', () => {
    const p = buildSitePrompt(biz({ category: '未知の業種' }));
    expect(p).toContain('さくら整体院');
    expect(p).toContain('捏造の禁止');
  });
});

describe('写真の扱い', () => {
  it('写真がない段階では「写真なしで完成させる」指示になる', () => {
    const p = buildSitePrompt(biz(), { hasPhotos: false, builderName: '', isProposal: true });
    expect(p).toContain('写真が1枚も無い状態で完成品として成立させる');
    expect(p).toContain('フリー素材は使わないこと');
  });

  it('写真がある段階では、実写真が必要な対象を明示する', () => {
    const p = buildSitePrompt(biz(), { hasPhotos: true, builderName: '', isProposal: true });
    expect(p).toContain('実写真でなければならない');
    expect(p).toContain('優良誤認');
  });

  it('灰色のプレースホルダを禁止する（提案物として弱くなるため）', () => {
    const p = buildSitePrompt(biz(), { hasPhotos: false, builderName: '', isProposal: true });
    expect(p).toContain('灰色のベタ塗り');
  });
});

describe('提案用プレビューとしての安全策', () => {
  it('noindex の指示が入る', () => {
    const p = buildSitePrompt(biz(), { hasPhotos: false, builderName: '山田', isProposal: true });
    expect(p).toContain('noindex');
  });

  it('制作者名がフッター表記に入る', () => {
    const p = buildSitePrompt(biz(), { hasPhotos: false, builderName: '山田デザイン', isProposal: true });
    expect(p).toContain('山田デザイン');
  });

  it('正式な公式サイトに見せないよう指示する', () => {
    const p = buildSitePrompt(biz(), { hasPhotos: false, builderName: '', isProposal: true });
    expect(p).toContain('提案用のサンプル');
  });

  it('店舗に広告規制がある場合、それもプロンプトに渡す', () => {
    const p = buildSitePrompt(biz({ regulatoryNotes: ['医療広告ガイドラインの確認が必要です'] }));
    expect(p).toContain('この店舗に適用される広告規制');
    expect(p).toContain('医療広告ガイドラインの確認が必要です');
  });
});

describe('AIの既定デザインを潰す指示', () => {
  it('よくある定型パターンを名指しで禁止する', () => {
    const p = buildSitePrompt(biz());
    expect(p).toContain('グラデーション');
    expect(p).toContain('架空の顧客の推薦文');
    expect(p).toContain('根拠のない数字');
  });

  it('技術要件が含まれる', () => {
    const p = buildSitePrompt(biz());
    expect(p).toContain('単一のHTMLファイル');
    expect(p).toContain('tel:');
    expect(p).toContain('スマートフォンを基準に設計');
  });
});

describe('設定データの整合性', () => {
  it('デザイン指針の業種が、業種プリセットと対応している', () => {
    const presets = new Set(CATEGORY_PRESETS.map((p) => p.label));
    for (const d of SITE_DESIGNS) {
      expect(presets.has(d.category), `${d.category} が CATEGORY_PRESETS にない`).toBe(true);
    }
  });

  it('すべての業種プリセットにデザイン指針がある', () => {
    for (const p of CATEGORY_PRESETS) {
      expect(findSiteDesign(p.label), `${p.label} のデザイン指針がない`).not.toBeNull();
    }
  });

  it('各デザイン指針に配色・構成・禁止事項が揃っている', () => {
    for (const d of SITE_DESIGNS) {
      expect(d.palette.accent, `${d.category} のアクセント色`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(d.sections.length, `${d.category} の構成`).toBeGreaterThan(3);
      expect(d.forbidden.length, `${d.category} の禁止事項`).toBeGreaterThan(0);
      expect(d.withoutPhotos.length, `${d.category} の写真なし時の方針`).toBeGreaterThan(20);
    }
  });
});

describe('先出し提案の進め方', () => {
  it('4段階が順番に定義されている', () => {
    expect(OUTREACH_FLOW.map((s) => s.no)).toEqual([1, 2, 3, 4]);
  });

  it('最初の段階では相手に何も求めない', () => {
    expect(OUTREACH_FLOW[0]?.askFromOwner).toContain('なし');
  });

  it('写真を求めるのは、見てもらった後の段階', () => {
    const photoStage = OUTREACH_FLOW.find((s) => s.askFromOwner.includes('写真'));
    expect(photoStage?.no).toBeGreaterThan(2);
  });

  it('合意前の公開を禁止している', () => {
    const all = OUTREACH_FLOW.flatMap((s) => s.never).join(' ');
    expect(all).toContain('公開');
  });

  it('メールの文面に特定電子メール法の必須表記が入っている', () => {
    const mails = OUTREACH_SCRIPTS.filter((s) => s.channel === 'メール');
    const first = mails.find((m) => m.body.includes('突然のご連絡'));
    expect(first).toBeDefined();
    // 氏名・住所・連絡先・配信停止方法
    expect(first?.body).toContain('【住所】');
    expect(first?.body).toContain('配信');
  });

  it('写真の使用許可を文面で残す手順がある', () => {
    const consent = OUTREACH_SCRIPTS.find((s) => s.label.includes('使用許可'));
    expect(consent).toBeDefined();
    expect(consent?.body).toContain('肖像権');
    expect(consent?.body).toContain('公開しません');
  });
});
