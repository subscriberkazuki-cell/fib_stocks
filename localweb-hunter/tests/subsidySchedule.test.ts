import { describe, it, expect } from 'vitest';
import { ROUND_NAME, SCHEDULE, TRACKS } from '@/config/subsidy';
import { OUTREACH_SCRIPTS, SUBSIDY_SCRIPTS } from '@/config/outreachFlow';
import { PSYCHOLOGY_NOTES, SUBSIDY_OBJECTIONS, SUBSIDY_SUPPORT_SCRIPTS } from '@/config/subsidyOutreach';
import { OBJECTIONS } from '@/config/approaches';
import {
  CONSULT_LEAD_DAYS, consultBy, daysBetween, form4LeadDays, jpDate, jpMonthDay, jun,
  REVERIFY_AFTER_DAYS, roundStatus, shortRoundName, verificationAgeDays,
} from '@/lib/subsidy/schedule';

/** ローカル時刻で日付を作る。TZ に依存させないため */
const at = (y: number, m: number, d: number): Date => new Date(y, m - 1, d);

describe('日付の表記', () => {
  it('年月日に整形する（時刻付きでも日付だけを見る）', () => {
    expect(jpDate('2026-12-15T17:00')).toBe('2026年12月15日');
    expect(jpDate('2026-11-05')).toBe('2026年11月5日');
    expect(jpMonthDay('2026-12-04')).toBe('12月4日');
  });

  it('壊れた日付は黙って通さず例外にする', () => {
    // 誤った締切が店舗に届くくらいなら、その場で落ちた方がいい
    expect(() => jpDate('2026-12')).toThrow();
    expect(() => jpDate('')).toThrow();
    expect(() => jpMonthDay('十二月四日')).toThrow();
  });

  it('上旬・中旬・下旬を日で切り分ける', () => {
    expect(jun('2026-11-10')).toBe('上旬');
    expect(jun('2026-11-11')).toBe('中旬');
    expect(jun('2026-11-20')).toBe('中旬');
    expect(jun('2026-11-21')).toBe('下旬');
  });

  it('日数差を月またぎでも正しく数える', () => {
    expect(daysBetween('2026-09-15', '2026-11-05')).toBe(51);
    expect(daysBetween('2026-12-04', '2026-12-15T17:00')).toBe(11);
    expect(daysBetween('2026-12-15', '2026-12-04')).toBe(-11);
  });

  it('公募回の名前は文中に差し込める短さにする', () => {
    expect(shortRoundName('第20回（一般型・通常枠）')).toBe('第20回');
    expect(shortRoundName(ROUND_NAME)).not.toContain('（');
  });
});

describe('相談開始の目安', () => {
  it('様式4の締切から3週間さかのぼった時期を返す', () => {
    expect(CONSULT_LEAD_DAYS).toBe(21);
    expect(consultBy('2026-12-04')).toBe('11月中旬');
  });

  it('締切が変われば目安も自動で動く', () => {
    // ここが固定文字列だと、公募回が変わったときに古い時期を案内してしまう
    expect(consultBy('2027-01-20')).toBe('12月下旬');
    expect(consultBy('2027-03-15')).toBe('2月下旬');
  });
});

/**
 * 段階の判定は固定の日程で確かめる。
 * 実際の SCHEDULE を使うと、次の公募回に更新したときに
 * ロジックと関係のないテストまで落ちて、更新の妨げになる。
 */
const FIXTURE = {
  applicationOpens: '2026-11-05',
  applicationCloses: '2026-12-15T17:00',
  form4Deadline: '2026-12-04',
  resultAnnouncement: '2027年3月頃',
};

describe('公募回の段階', () => {
  it('受付前は開始までの日数を出し、文面はまだ使える', () => {
    const s = roundStatus(FIXTURE, at(2026, 9, 15));
    expect(s.phase).toBe('upcoming');
    expect(s.usable).toBe(true);
    expect(s.daysUntilOpen).toBe(51);
    expect(s.headline).toContain('あと51日');
    expect(s.warning).toBeNull();
  });

  it('受付中は様式4の締切までの日数を出す', () => {
    const s = roundStatus(FIXTURE, at(2026, 11, 5));
    expect(s.phase).toBe('open');
    expect(s.usable).toBe(true);
    expect(s.daysUntilForm4).toBe(29);
    expect(s.headline).toContain('あと29日');
  });

  it('様式4の締切当日は、まだ締切前として扱う', () => {
    const s = roundStatus(FIXTURE, at(2026, 12, 4));
    expect(s.phase).toBe('open');
    expect(s.daysUntilForm4).toBe(0);
  });

  it('様式4の締切を過ぎたら、申請締切前でも文面を使えなくする', () => {
    // 申請締切はまだ先でも、様式4が取れない以上その回には申請できない。
    // ここで usable を true にすると、相手を無駄に窓口へ行かせることになる。
    const s = roundStatus(FIXTURE, at(2026, 12, 5));
    expect(s.phase).toBe('form4_closed');
    expect(s.usable).toBe(false);
    expect(s.daysUntilClose).toBe(10);
    expect(s.warning).toContain('送らないでください');
  });

  it('申請締切の当日は、まだ締切後にしない', () => {
    expect(roundStatus(FIXTURE, at(2026, 12, 15)).phase).toBe('form4_closed');
  });

  it('受付が終われば、日程が古いことを警告する', () => {
    const s = roundStatus(FIXTURE, at(2026, 12, 16));
    expect(s.phase).toBe('closed');
    expect(s.usable).toBe(false);
    expect(s.warning).toContain('src/config/subsidy.ts');
  });

  it('使えない段階には必ず、何をすべきかが書いてある', () => {
    for (const d of [at(2026, 12, 5), at(2026, 12, 16), at(2027, 6, 1)]) {
      const s = roundStatus(FIXTURE, d);
      expect(s.usable, d.toDateString()).toBe(false);
      expect(s.warning, d.toDateString()).toBeTruthy();
    }
  });

  it('実際の SCHEDULE も、様式4 → 申請締切の順番になっている', () => {
    // 公募回を更新したときに、順番を取り違えていないかだけを見る
    expect(daysBetween(SCHEDULE.applicationOpens, SCHEDULE.form4Deadline)).toBeGreaterThan(0);
    expect(form4LeadDays(SCHEDULE)).toBeGreaterThan(0);
  });
});

describe('制度内容の確認日', () => {
  it('確認からの経過日数を数える', () => {
    expect(verificationAgeDays('2026-09-14', at(2026, 9, 15))).toBe(1);
    expect(verificationAgeDays('2026-09-14', at(2026, 12, 14))).toBe(91);
    expect(REVERIFY_AFTER_DAYS).toBe(90);
  });
});

// ============================================================
// ここが本題。
// 営業文の日付は、そのまま実在の店舗に送られる。
// 文面に日付を直接書くと、SCHEDULE を更新しても文面側が古いまま残る。
// ============================================================

describe('日付の出典がひとつになっている', () => {
  /** 画面に出る、または店舗に送られる文字列をすべて集める */
  const displayed: { where: string; text: string }[] = [
    ...SUBSIDY_SUPPORT_SCRIPTS.flatMap((s) => [
      { where: `補助金サポート営業文「${s.label}」`, text: s.body },
      { where: `補助金サポート営業文「${s.label}」の注記`, text: s.note },
    ]),
    ...SUBSIDY_SCRIPTS.flatMap((s) => [
      { where: `補助金スクリプト「${s.label}」`, text: s.body },
      { where: `補助金スクリプト「${s.label}」の注記`, text: s.note },
    ]),
    ...OUTREACH_SCRIPTS.flatMap((s) => [
      { where: `営業文「${s.label}」`, text: s.body },
      { where: `営業文「${s.label}」の注記`, text: s.note },
    ]),
    ...PSYCHOLOGY_NOTES.map((n) => ({ where: `心理設計「${n.principle}」`, text: `${n.why}${n.how}` })),
    ...SUBSIDY_OBJECTIONS.map((o) => ({
      where: `補助金の反論対応「${o.said}」`,
      text: `${o.meaning}\n${o.response}\n${o.stopIf}`,
    })),
    ...OBJECTIONS.map((o) => ({
      where: `反論対応「${o.said}」`,
      text: `${o.meaning}\n${o.response}\n${o.stopIf}`,
    })),
    ...TRACKS.flatMap((t) => [
      { where: `トラック「${t.label}」`, text: t.flow.join('\n') },
      { where: `トラック「${t.label}」の注意`, text: t.caution },
    ]),
  ];

  it('集めた文面が空になっていない（テストが素通りしていないことの確認）', () => {
    expect(displayed.length).toBeGreaterThan(20);
    expect(displayed.every((d) => d.text.length > 0)).toBe(true);
  });

  it('文面に出てくる日付は、すべて SCHEDULE から導かれたものになっている', () => {
    const allowed = new Set([
      jpDate(SCHEDULE.applicationOpens),
      jpDate(SCHEDULE.applicationCloses),
      jpDate(SCHEDULE.form4Deadline),
      jpMonthDay(SCHEDULE.applicationOpens),
      jpMonthDay(SCHEDULE.applicationCloses),
      jpMonthDay(SCHEDULE.form4Deadline),
    ]);
    const dateLike = /(?:\d{4}年)?\d{1,2}月\d{1,2}日/g;

    const strays: string[] = [];
    for (const { where, text } of displayed) {
      for (const hit of text.match(dateLike) ?? []) {
        // '2026年12月15日' は '12月15日' としても許可済みなので、短い形も見る
        if (allowed.has(hit) || allowed.has(hit.replace(/^\d{4}年/, ''))) continue;
        strays.push(`${where}: 「${hit}」`);
      }
    }
    expect(strays, '文面に直書きされた日付。SCHEDULE から組み立てること').toEqual([]);
  });

  it('様式4が何日早いかも直書きせず、SCHEDULE から数えている', () => {
    const lead = form4LeadDays(SCHEDULE);
    expect(lead).toBeGreaterThan(0);
    const text = displayed.map((d) => d.text).join('\n');
    // 実際に使われていること（この表現ごと消えたら気づけるように）
    expect(text).toContain(`${lead}日早`);
  });

  it('相談開始の目安も直書きされていない', () => {
    const by = consultBy(SCHEDULE.form4Deadline);
    const text = displayed.map((d) => d.text).join('\n');
    expect(text).toContain(by);

    // 目安と食い違う「◯月上旬／中旬／下旬までに」が残っていないこと
    const strays = (text.match(/\d{1,2}月(?:上旬|中旬|下旬)/g) ?? []).filter((m) => m !== by);
    expect(strays, '文面に直書きされた時期').toEqual([]);
  });
});
