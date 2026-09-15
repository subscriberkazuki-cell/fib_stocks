// 設定ファイル中の `**強調**` の描画。
//
// ここが守っているのは「法的な警告が読み飛ばされないこと」。
// 以前は `**` がそのまま画面に出ていて、強調が効かないどころか読みにくくなっていた。
// 強調が入っているのは行政書士法の線引きや「やってはいけないこと」なので、実害に直結する。

import { describe, expect, it } from 'vitest';
import { hasUnclosedEmphasis, parseEmphasis } from '@/lib/text/emphasis';
import { BOUNDARY_RULES, PRICING_POLICY, SUPPORT_SERVICES } from '@/config/subsidySupport';
import { PSYCHOLOGY_NOTES, SUBSIDY_OBJECTIONS, SUBSIDY_SUPPORT_SCRIPTS } from '@/config/subsidyOutreach';
import { OUTREACH_FLOW, OUTREACH_SCRIPTS, SUBSIDY_SCRIPTS } from '@/config/outreachFlow';
import { INDUSTRY_APPROACHES, OBJECTIONS } from '@/config/approaches';
import { PROCEDURE } from '@/config/procedure';

describe('強調の解析', () => {
  it('囲まれた部分だけを強調にする', () => {
    expect(parseEmphasis('前**中**後')).toEqual([
      { text: '前', strong: false },
      { text: '中', strong: true },
      { text: '後', strong: false },
    ]);
  });

  it('強調が複数あっても分割できる', () => {
    expect(parseEmphasis('**A**と**B**').filter((p) => p.strong).map((p) => p.text)).toEqual(['A', 'B']);
  });

  it('改行をまたぐ強調も拾う（文面が複数行のため）', () => {
    expect(parseEmphasis('**1行目\n2行目**')[0]).toEqual({ text: '1行目\n2行目', strong: true });
  });

  it('強調がなければそのまま1つ返す', () => {
    expect(parseEmphasis('ふつうの文')).toEqual([{ text: 'ふつうの文', strong: false }]);
  });

  it('空文字は空配列（余計な要素を出さない）', () => {
    expect(parseEmphasis('')).toEqual([]);
  });

  it('閉じていない `**` は消さずに平文として残す', () => {
    // 勝手に消すと文意が変わるので、見えたままにして書き手に気づかせる
    expect(parseEmphasis('**閉じてない')).toEqual([{ text: '**閉じてない', strong: false }]);
    expect(hasUnclosedEmphasis('**閉じてない')).toBe(true);
    expect(hasUnclosedEmphasis('**閉じている**')).toBe(false);
  });

  it('文字を落とさない（結合すると元に戻る）', () => {
    for (const s of ['**A**', '前**中**後', 'なし', '**A**B**C**', '**閉じてない']) {
      expect(parseEmphasis(s).map((p) => (p.strong ? `**${p.text}**` : p.text)).join('')).toBe(s);
    }
  });
});

describe('画面に出す設定文字列', () => {
  // 画面に出る文字列を1か所に集める。ここに閉じ忘れがあると `**` が生で表示される。
  const displayed: { where: string; text: string }[] = [
    ...BOUNDARY_RULES.flatMap((r) => [
      { where: `BOUNDARY_RULES:${r.action}`, text: r.action },
      { where: `BOUNDARY_RULES:${r.action}.why`, text: r.why },
    ]),
    ...SUPPORT_SERVICES.flatMap((s) => [
      { where: `SUPPORT_SERVICES:${s.name}.fills`, text: s.fills },
      { where: `SUPPORT_SERVICES:${s.name}.legalNote`, text: s.legalNote },
      ...s.deliverables.map((d) => ({ where: `SUPPORT_SERVICES:${s.name}.deliverables`, text: d })),
    ]),
    { where: 'PRICING_POLICY.reason', text: PRICING_POLICY.reason },
    ...PSYCHOLOGY_NOTES.flatMap((n) => [
      { where: `PSYCHOLOGY_NOTES:${n.principle}.why`, text: n.why },
      { where: `PSYCHOLOGY_NOTES:${n.principle}.how`, text: n.how },
    ]),
    ...SUBSIDY_OBJECTIONS.flatMap((o) => [
      { where: `SUBSIDY_OBJECTIONS:${o.said}.meaning`, text: o.meaning },
      { where: `SUBSIDY_OBJECTIONS:${o.said}.response`, text: o.response },
      { where: `SUBSIDY_OBJECTIONS:${o.said}.stopIf`, text: o.stopIf },
    ]),
    ...OBJECTIONS.flatMap((o) => [
      { where: `OBJECTIONS:${o.said}.meaning`, text: o.meaning },
      { where: `OBJECTIONS:${o.said}.response`, text: o.response },
      { where: `OBJECTIONS:${o.said}.stopIf`, text: o.stopIf },
    ]),
    ...[...SUBSIDY_SUPPORT_SCRIPTS, ...OUTREACH_SCRIPTS, ...SUBSIDY_SCRIPTS].flatMap((s) => [
      { where: `script:${s.label}.body`, text: s.body },
      { where: `script:${s.label}.note`, text: s.note },
    ]),
    ...OUTREACH_FLOW.flatMap((f) => [
      { where: `OUTREACH_FLOW:${f.title}.rationale`, text: f.rationale },
      { where: `OUTREACH_FLOW:${f.title}.askFromOwner`, text: f.askFromOwner },
    ]),
    ...INDUSTRY_APPROACHES.flatMap((a) => [
      { where: `APPROACH:${a.category}.painPoint`, text: a.painPoint },
      { where: `APPROACH:${a.category}.hook`, text: a.hook },
      { where: `APPROACH:${a.category}.caution`, text: a.caution },
    ]),
    ...PROCEDURE.flatMap((s) => [
      { where: `PROCEDURE:${s.title}.why`, text: s.why },
      { where: `PROCEDURE:${s.title}.pitfall`, text: s.pitfall },
    ]),
  ];

  it('検査対象がちゃんと集まっている', () => {
    expect(displayed.length).toBeGreaterThan(100);
  });

  it('閉じ忘れの `**` がない（あると画面に記号が出る）', () => {
    const broken = displayed.filter((d) => hasUnclosedEmphasis(d.text));
    expect(broken.map((b) => b.where)).toEqual([]);
  });
});
