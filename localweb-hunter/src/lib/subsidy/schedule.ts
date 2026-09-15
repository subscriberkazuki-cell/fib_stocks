// 公募回の日程を扱う。
//
// ============================================================
// なぜ独立したモジュールにしているか
// ============================================================
//
// **営業文に書いた日付は、そのまま実在の店舗に送られる。**
// 文面の中に日付を直接書くと、出典が SCHEDULE と文面の2か所に分かれる。
// 公募回が変わって SCHEDULE を更新しても、文面側の日付は古いまま残り、
// **気づかないまま誤った締切を相手に伝えることになる。**
//
// 相手はその日付を信じて商工会議所の予約を取る。外れれば申請できない。
// このアプリが「未確認」を推測で埋めないのと同じ理由で、日付も推測させない。
//
// したがって日付の出典は SCHEDULE ひとつに固定し、文面はここから組み立てる。
//
// このモジュールは **何も import しない**。
// config 側（src/config/subsidy.ts）から呼んでも循環参照にならないようにするため。

export interface RoundSchedule {
  applicationOpens: string;
  applicationCloses: string;
  form4Deadline: string;
  resultAnnouncement: string;
}

/** 'YYYY-MM-DD' または 'YYYY-MM-DDTHH:mm' を分解する */
function parts(iso: string): { y: number; m: number; d: number } {
  const [date] = iso.split('T');
  const [y, m, d] = (date ?? '').split('-').map(Number);
  // 壊れた日付を黙って通すと、誤った締切が店舗に届く。ここは止める。
  if (!y || !m || !d) throw new Error(`日付の形式が不正です: ${iso}`);
  return { y, m, d };
}

function utc(iso: string): number {
  const { y, m, d } = parts(iso);
  return Date.UTC(y, m - 1, d);
}

/** '2026-12-15T17:00' → '2026年12月15日' */
export function jpDate(iso: string): string {
  const { y, m, d } = parts(iso);
  return `${y}年${m}月${d}日`;
}

/** '2026-12-04' → '12月4日'。同じ年の話をしている文脈で使う */
export function jpMonthDay(iso: string): string {
  const { m, d } = parts(iso);
  return `${m}月${d}日`;
}

/** 上旬(1-10日) / 中旬(11-20日) / 下旬(21日-) */
export function jun(iso: string): '上旬' | '中旬' | '下旬' {
  const { d } = parts(iso);
  if (d <= 10) return '上旬';
  if (d <= 20) return '中旬';
  return '下旬';
}

/** 日数差（日付単位。時刻は無視する） */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((utc(toIso) - utc(fromIso)) / 86_400_000);
}

function addDays(iso: string, days: number): string {
  const { y, m, d } = parts(iso);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function today(now: Date): string {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    .toISOString()
    .slice(0, 10);
}

/**
 * 窓口に相談を始めてほしい時期。様式4の締切から3週間前を目安にする。
 * 締切直前は相談が集中して予約が取れないので、この余裕は実務上必要。
 */
export const CONSULT_LEAD_DAYS = 21;

/** '2026-12-04' → '11月中旬' */
export function consultBy(form4Deadline: string): string {
  const target = addDays(form4Deadline, -CONSULT_LEAD_DAYS);
  return `${parts(target).m}月${jun(target)}`;
}

/** 様式4の締切が申請締切より何日早いか。ここは回ごとに変わり得る */
export function form4LeadDays(s: RoundSchedule): number {
  return daysBetween(s.form4Deadline, s.applicationCloses);
}

/** '第20回（一般型・通常枠）' → '第20回'。文中に差し込むとき用 */
export function shortRoundName(roundName: string): string {
  return roundName.replace(/[（(].*$/, '');
}

export type RoundPhase = 'upcoming' | 'open' | 'form4_closed' | 'closed';

export interface RoundStatus {
  phase: RoundPhase;
  /**
   * 営業文をそのまま送ってよいか。
   * false のとき、文面に書かれた日程は実態と食い違っている。
   */
  usable: boolean;
  /** 画面に出す一行 */
  headline: string;
  /** usable が false のときに、何をすべきか */
  warning: string | null;
  daysUntilOpen: number;
  daysUntilForm4: number;
  daysUntilClose: number;
}

/**
 * 今がこの公募回のどの段階かを返す。
 *
 * 境目は日付単位で見る。締切当日はまだ締切前として扱う。
 *
 * **form4_closed が重要。** 申請締切がまだ先でも、様式4の発行締切を過ぎた時点で
 * 店舗はもうこの回に申請できない。この状態で「商工会議所に相談すれば間に合います」
 * と送るのは、相手を無駄に動かすことになる。だから usable を false にしている。
 */
export function roundStatus(s: RoundSchedule, now: Date): RoundStatus {
  const t = today(now);
  const daysUntilOpen = daysBetween(t, s.applicationOpens);
  const daysUntilForm4 = daysBetween(t, s.form4Deadline);
  const daysUntilClose = daysBetween(t, s.applicationCloses);
  const base = { daysUntilOpen, daysUntilForm4, daysUntilClose };

  const stale =
    '**この日程は過去のものです。** 営業文に書かれた締切はもう過ぎています。' +
    '次回の公募要領を確認して src/config/subsidy.ts を更新するまで、この文面を送らないでください。';

  if (daysUntilOpen > 0) {
    return {
      ...base,
      phase: 'upcoming',
      usable: true,
      headline:
        `申請受付の開始まであと${daysUntilOpen}日（${jpDate(s.applicationOpens)}から）。` +
        `様式4の相談は${consultBy(s.form4Deadline)}までに始めてもらうこと。`,
      warning: null,
    };
  }
  if (daysUntilForm4 >= 0) {
    return {
      ...base,
      phase: 'open',
      usable: true,
      headline:
        `申請受付中。**様式4の発行締切まであと${daysUntilForm4}日**` +
        `（${jpDate(s.form4Deadline)}）。ここを過ぎるとこの回は申請できません。`,
      warning: null,
    };
  }
  if (daysUntilClose >= 0) {
    return {
      ...base,
      phase: 'form4_closed',
      usable: false,
      headline:
        `**様式4の発行締切（${jpDate(s.form4Deadline)}）が過ぎました。** ` +
        `申請締切まであと${daysUntilClose}日ありますが、様式4を新規に取得できないため、` +
        `今から案内しても店舗はこの回に申請できません。`,
      warning:
        '**この回の案内はもう送らないでください。** 様式4が取得できないので、' +
        '相手を無駄に窓口へ行かせることになります。次回の公募を待って案内してください。',
    };
  }
  return {
    ...base,
    phase: 'closed',
    usable: false,
    headline: `申請受付は${jpDate(s.applicationCloses)}に終了しました。`,
    warning: stale,
  };
}

/** 制度内容を確認してから何日経ったか。長くなったら読み直す */
export function verificationAgeDays(verifiedOn: string, now: Date): number {
  return daysBetween(verifiedOn, today(now));
}

/** これを超えたら公募要領を読み直す目安 */
export const REVERIFY_AFTER_DAYS = 90;
