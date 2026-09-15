import { describe, it, expect } from 'vitest';
import type { Business, SourcedField } from '@/types/business';
import type { SenderIdentity } from '@/config/sender';
import { SENDER_FIELDS, missingRequiredSenderFields } from '@/config/sender';
import { composeMail, isMailtoTooLong, mailtoUrl } from '@/lib/outreach/compose';
import {
  STANDARD_MAIL_LABEL, SUBSIDY_MAIL_LABEL, allRoutes, chooseRoute,
} from '@/lib/outreach/route';
import { OUTREACH_SCRIPTS } from '@/config/outreachFlow';
import { SUBSIDY_SUPPORT_SCRIPTS } from '@/config/subsidyOutreach';

function sourced<T>(value: T): SourcedField<T> {
  return { value, source: 'business_data_provider', verified: true, observedAt: '2026-09-15T00:00:00Z' };
}

function biz(over: Partial<Business> = {}): Business {
  const now = new Date().toISOString();
  return {
    id: 'b1', source: 't', sourceBusinessId: 's1',
    name: 'みどりベーカリー', category: '飲食店', address: '', prefecture: '千葉県', city: '柏市',
    latitude: null, longitude: null,
    phone: sourced('04-7167-1111'),
    email: sourced('shop@example.com'),
    rating: sourced(4.7), reviewCount: sourced(238),
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

const SENDER: SenderIdentity = {
  name: '柏 太郎',
  company: '〇〇ウェブ制作',
  address: '千葉県柏市あけぼの1-2-3',
  phone: '04-0000-0000',
  email: 'me@example.com',
};

const STANDARD = OUTREACH_SCRIPTS.find((s) => s.label === STANDARD_MAIL_LABEL)!;
const SUBSIDY = SUBSIDY_SUPPORT_SCRIPTS.find((s) => s.label === SUBSIDY_MAIL_LABEL)!;
const URL_OK = 'https://example.com/preview';

describe('雛形の差し込み', () => {
  it('店名・差出人・評価が実データで埋まる', () => {
    const m = composeMail(STANDARD.body, { business: biz(), sender: SENDER, previewUrl: URL_OK });
    expect(m.blockers).toEqual([]);
    expect(m.body).toContain('みどりベーカリー');
    expect(m.body).toContain('柏 太郎');
    expect(m.body).toContain('千葉県柏市あけぼの1-2-3');
    expect(m.body).toContain('4.7');
    expect(m.body).toContain('238');
    expect(m.body).toContain(URL_OK);
  });

  it('件名が1行目から切り出され、本文には残らない', () => {
    const m = composeMail(STANDARD.body, { business: biz(), sender: SENDER, previewUrl: URL_OK });
    expect(m.subject).toBe('みどりベーカリー様のホームページを試しに作ってみました');
    expect(m.body.startsWith('件名：')).toBe(false);
    expect(m.body).not.toContain('件名：');
  });

  it('送れる状態のとき、本文に差し込み記号が1つも残っていない', () => {
    for (const tpl of [STANDARD.body, SUBSIDY.body]) {
      const m = composeMail(tpl, { business: biz(), sender: SENDER, previewUrl: URL_OK });
      expect(m.blockers, tpl.slice(0, 20)).toEqual([]);
      expect(m.body, tpl.slice(0, 20)).not.toMatch(/【[^】]*】/);
      expect(m.subject).not.toMatch(/【[^】]*】/);
      // 〔〕 も外に出さない
      expect(m.body).not.toContain('〔');
      expect(m.body).not.toContain('〕');
    }
  });

  it('市区町村は店舗のデータから入る（柏市が焼き付いていない）', () => {
    const m = composeMail(SUBSIDY.body, {
      business: biz({ city: '松戸市' }), sender: SENDER,
    });
    expect(m.body).toContain('松戸市内のお店');
    expect(m.body).not.toContain('柏市内のお店');
  });
});

// ============================================================
// ここが要。数字を作らないこと。
// ============================================================

describe('データが無いときに推測で埋めない', () => {
  it('評価が未取得なら、その一文ごと落とす', () => {
    const m = composeMail(STANDARD.body, {
      business: biz({ rating: null }), sender: SENDER, previewUrl: URL_OK,
    });
    expect(m.blockers).toEqual([]);            // 送れなくはならない
    expect(m.body).not.toContain('評価');       // 評価の話が消えている
    expect(m.body).not.toMatch(/【[^】]*】/);    // 記号も残らない
    expect(m.dropped.length).toBe(1);
    expect(m.dropped[0]).toContain('評価');
  });

  it('口コミ件数だけ欠けていても、同じ一文ごと落とす', () => {
    const m = composeMail(STANDARD.body, {
      business: biz({ reviewCount: null }), sender: SENDER, previewUrl: URL_OK,
    });
    expect(m.body).not.toContain('口コミ');
    expect(m.dropped.length).toBe(1);
  });

  it('落とした一文は dropped に残し、黙って消さない', () => {
    const m = composeMail(SUBSIDY.body, { business: biz({ rating: null }), sender: SENDER });
    expect(m.dropped.length).toBeGreaterThan(0);
    // 本文に無い文が dropped にある = 送る前に気づける
    for (const d of m.dropped) expect(m.body).not.toContain(d);
  });

  it('評価も口コミもある店舗では、何も落とさない', () => {
    const m = composeMail(STANDARD.body, { business: biz(), sender: SENDER, previewUrl: URL_OK });
    expect(m.dropped).toEqual([]);
  });
});

describe('店名そのものに記号が含まれていても壊れない', () => {
  it('店名に【】が入っていても、送信は止まらず名前もそのまま残る', () => {
    const name = '【サンプル】こもれび居酒屋';
    const m = composeMail(SUBSIDY.body, { business: biz({ name }), sender: SENDER });
    expect(m.blockers).toEqual([]);
    expect(m.body).toContain(name);
  });

  it('落とさない〔…〕の中に店名が入っていても、二重に走査しない', () => {
    // 置換した結果を再走査すると、店名の【】を未解決の差し込みと誤認する
    const tpl = '件名：確認\n\n〔評価【評価】の【店名】様〕\n【自分の名前】';
    const m = composeMail(tpl, { business: biz({ name: '【サンプル】店' }), sender: SENDER });
    expect(m.blockers).toEqual([]);
    expect(m.body).toContain('評価4.7の【サンプル】店様');
  });
});

describe('送ってはいけない状態を止める', () => {
  it('メールアドレスが未取得なら送らせない', () => {
    const m = composeMail(STANDARD.body, {
      business: biz({ email: null }), sender: SENDER, previewUrl: URL_OK,
    });
    expect(m.to).toBeNull();
    expect(m.blockers.join(' ')).toContain('メールアドレスが未取得');
  });

  it('差出人の法定必須項目が空なら送らせない（特定電子メール法）', () => {
    for (const f of SENDER_FIELDS.filter((x) => x.required)) {
      const sender = { ...SENDER, [f.key]: '' };
      const m = composeMail(STANDARD.body, { business: biz(), sender, previewUrl: URL_OK });
      expect(m.blockers.join(' '), f.label).toContain(f.label);
      expect(m.blockers.join(' '), f.label).toContain('特定電子メール法');
    }
  });

  it('必須でない項目が空でも、送信自体は止めない', () => {
    // 屋号を持たない個人事業主でも送れる必要がある
    for (const f of SENDER_FIELDS.filter((x) => !x.required)) {
      const sender = { ...SENDER, [f.key]: '' };
      const m = composeMail(SUBSIDY.body, { business: biz(), sender });
      expect(m.blockers, f.label).toEqual([]);
      expect(m.body, f.label).not.toMatch(/【[^】]*】/);
    }
  });

  it('屋号が無ければ署名から静かに外し、店舗データの欠落と混ぜない', () => {
    const m = composeMail(SUBSIDY.body, {
      business: biz(), sender: { ...SENDER, company: '', phone: '' },
    });
    expect(m.blockers).toEqual([]);
    // 「評価の一文を落とした」のような、確認すべき欠落だけが dropped に入る
    expect(m.dropped).toEqual([]);
    expect(m.body).toContain(SENDER.name);
    expect(m.body).toContain(SENDER.email);
    expect(m.body).not.toContain('／');
  });

  it('送れない理由を、同じ項目で二重に並べない', () => {
    const m = composeMail(STANDARD.body, {
      business: biz({ email: null }),
      sender: { name: '', company: '', address: '', phone: '', email: '' },
      previewUrl: '',
    });
    expect(new Set(m.blockers).size).toBe(m.blockers.length);
    // 氏名の欠落が1行だけであること
    const nameLines = m.blockers.filter((b) => b.includes('氏名'));
    expect(nameLines).toHaveLength(1);
  });

  it('先出しページのURLが無ければ、その文面は送らせない', () => {
    // 「▼ こちらです【URL】」のまま送ってしまうのを防ぐ
    const m = composeMail(STANDARD.body, { business: biz(), sender: SENDER, previewUrl: '' });
    expect(m.blockers.join(' ')).toContain('先出しページのURL');
  });

  it('補助金の文面は、先出しページが無くてもそのまま送れる', () => {
    const m = composeMail(SUBSIDY.body, { business: biz(), sender: SENDER });
    expect(m.blockers).toEqual([]);
  });

  it('同じ理由を何度も並べない', () => {
    const m = composeMail(STANDARD.body, {
      business: biz({ email: null }), sender: { name: '', company: '', address: '', phone: '', email: '' },
    });
    expect(new Set(m.blockers).size).toBe(m.blockers.length);
  });
});

describe('法律上必要な記載が、組み立て後も残っている', () => {
  it('差出人の氏名・住所・連絡先・配信停止の4点が本文にある', () => {
    for (const tpl of [STANDARD.body, SUBSIDY.body]) {
      const m = composeMail(tpl, { business: biz(), sender: SENDER, previewUrl: URL_OK });
      expect(m.body).toContain(SENDER.name);
      expect(m.body).toContain(SENDER.address);
      expect(m.body).toContain(SENDER.email);
      expect(m.body).toContain('配信');  // 配信停止の案内
    }
  });

  it('差出人情報が揃っていれば、未入力の必須項目は無い', () => {
    expect(missingRequiredSenderFields(SENDER)).toEqual([]);
  });
});

describe('mailto の組み立て', () => {
  it('宛先・件名・本文が入る', () => {
    const m = composeMail(SUBSIDY.body, { business: biz(), sender: SENDER });
    const url = mailtoUrl(m);
    expect(url.startsWith('mailto:shop@example.com?')).toBe(true);
    expect(url).toContain('subject=');
    expect(url).toContain('body=');
    // 空白が + にならない（メールソフトによっては + がそのまま出る）
    expect(url).not.toContain('+');
  });

  it('本文が長い文面は、長すぎると判定して貼り付けを促せる', () => {
    const m = composeMail(SUBSIDY.body, { business: biz(), sender: SENDER });
    expect(isMailtoTooLong(m)).toBe(true);
  });

  it('短い文面は長すぎ扱いにしない', () => {
    const m = composeMail('件名：短い\n\n本文です。', { business: biz(), sender: SENDER });
    expect(isMailtoTooLong(m)).toBe(false);
  });
});

describe('どの文面を出すかの判定', () => {
  it('雛形は実在する（label を変えたら気づける）', () => {
    expect(STANDARD).toBeDefined();
    expect(SUBSIDY).toBeDefined();
    expect(() => allRoutes()).not.toThrow();
    expect(allRoutes()).toHaveLength(2);
  });

  it('補助金の見込みが高い店舗には、補助金の案内を先に出す', () => {
    const c = chooseRoute(biz({ category: '飲食店', websiteStatus: 'none' }));
    expect(c.recommended.key).toBe('subsidy');
    expect(c.why).toContain('補助金');
  });

  it('見込みが高くない店舗には、通常のHP提案を出す', () => {
    const c = chooseRoute(biz({
      category: '飲食店', rating: null, reviewCount: null, websiteStatus: 'official_good',
    }));
    expect(c.recommended.key).toBe('standard');
  });

  it('法人格の確認が要る業種には、補助金の案内を先に送らない', () => {
    // 医療法人なら対象外なので、確認前に「対象です」と読める案内を送ると期待を裏切る
    const c = chooseRoute(biz({ category: 'クリニック・歯科' }));
    expect(c.recommended.key).toBe('standard');
  });

  it('推奨でない方も選べる（手で切り替えられる）', () => {
    const c = chooseRoute(biz());
    expect(c.routes.map((r) => r.key).sort()).toEqual(['standard', 'subsidy']);
    for (const r of c.routes) expect(r.why.length).toBeGreaterThan(0);
  });

  it('先出しページが要るのは通常ルートだけ', () => {
    const routes = allRoutes();
    expect(routes.find((r) => r.key === 'standard')!.needsPreviewUrl).toBe(true);
    expect(routes.find((r) => r.key === 'subsidy')!.needsPreviewUrl).toBe(false);
  });
});
