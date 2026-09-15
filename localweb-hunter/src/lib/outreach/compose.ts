// 営業文を、その店舗あての実際のメールに組み立てる。
//
// ============================================================
// 設計の中心：埋められないものを、埋めたことにしない
// ============================================================
//
// 雛形には【店名】【評価】のような差し込みがある。
// 素朴に文字列置換すると、データが無い店舗で次のどちらかが起きる。
//
//   a) 【評価】がそのまま残ったメールを送ってしまう
//   b) 適当な数字で埋めてしまう ← **こちらは実害が大きい**
//
// このアプリは電話番号もメールも推測生成しない方針で作ってある。
// 営業文の中の数字だけ推測してよい理由はない。相手の店の評価を勝手に書けば、
// 「調べもせず一斉送信している」と即座に伝わり、信用も失う。
//
// そこで、
//   ・データが無い差し込みは **埋めない**
//   ・その差し込みを含む一文は 〔…〕 で囲っておき、**文ごと落とす**
//   ・〔…〕 の外に埋められない差し込みが残ったら、**送信を止める**（blockers）
// という形にした。文が落ちたことは dropped に残して、送る前に目視できるようにする。
//
// 特定電子メール法の必須項目（氏名・住所・受信拒否の連絡先）が未設定のときも、
// 同じく送信を止める。書き忘れたまま送れてしまう作りにはしない。

import type { Business } from '@/types/business';
import { SENDER_FIELDS, type SenderField, type SenderIdentity } from '@/config/sender';
import { formatFindings, siteFindings } from '@/lib/outreach/siteFindings';

/**
 * 差し込みが埋まらなかった理由の種類。
 * 同じ「未設定」でも、扱いがまったく違うので区別する。
 *   shop          … 店舗のデータが無い。文ごと落とす対象
 *   senderRequired… 法律上必須の差出人情報。送信を止める
 *   senderOptional… 任意の差出人情報。署名から静かに外す
 *   input         … その場で入れてもらう値（先出しページのURLなど）
 */
type MissingKind = 'shop' | 'senderRequired' | 'senderOptional' | 'input';

interface Missing {
  why: string;
  kind: MissingKind;
}

/** 差し込みを解決した結果 */
type Resolution = { ok: true; value: string } | ({ ok: false } & Missing);

const ok = (value: string): Resolution => ({ ok: true, value });
const no = (why: string, kind: MissingKind): Resolution => ({ ok: false, why, kind });

/**
 * 差出人情報が空のときの理由。
 * **法定チェックと差し込みチェックで同じ文言を使う。**
 * 別々に書くと、同じ欠落が違う言い回しで2回並び、読む側が数えられなくなる。
 */
export function senderMissingReason(field: SenderField): string {
  return field.required
    ? `差出人の${field.label}が未設定です（特定電子メール法で表示が義務づけられています）`
    : `差出人の${field.label}が未設定です`;
}

export interface MailContext {
  business: Business;
  sender: SenderIdentity;
  /** 先出しで作ったページのURL。まだ無ければ null */
  previewUrl?: string | null;
}

export interface ComposedMail {
  /** 宛先。未取得なら null */
  to: string | null;
  subject: string;
  body: string;
  /**
   * 送ってはいけない理由。1つでもあれば送信させない。
   * 「埋まっていない差し込みがある」「法律上の必須項目が無い」「宛先が無い」など。
   */
  blockers: string[];
  /** データが無くて落とした一文。送る前に自分の目で確かめるため */
  dropped: string[];
}

function resolvers(ctx: MailContext): Record<string, () => Resolution> {
  const b = ctx.business;
  const s = ctx.sender;

  const shop = (v: string, label: string): Resolution =>
    v.trim() === '' ? no(`${label}が未取得です`, 'shop') : ok(v.trim());

  const sender = (key: keyof SenderIdentity): Resolution => {
    const field = SENDER_FIELDS.find((f) => f.key === key)!;
    const v = s[key].trim();
    if (v !== '') return ok(v);
    return no(senderMissingReason(field), field.required ? 'senderRequired' : 'senderOptional');
  };

  return {
    店名: () => shop(b.name, '店名'),
    市区町村: () => shop(b.city ?? '', '市区町村'),
    評価: () => (b.rating ? ok(String(b.rating.value)) : no('評価が未取得です', 'shop')),
    口コミ件数: () =>
      b.reviewCount
        ? ok(b.reviewCount.value.toLocaleString('ja-JP'))
        : no('口コミ件数が未取得です', 'shop'),
    気になった点: () => {
      // 実際にクロールして観測したことだけを根拠にする。
      // 何も観測できていなければ、書くことが無い＝この文面は送れない。
      const f = siteFindings(b);
      return f.length === 0
        ? no('サイトの調査結果が無く、指摘できる点を挙げられません', 'shop')
        : ok(formatFindings(f));
    },
    URL: () =>
      (ctx.previewUrl ?? '').trim() === ''
        ? no('先出しページのURLが未入力です', 'input')
        : ok((ctx.previewUrl ?? '').trim()),
    自分の名前: () => sender('name'),
    屋号: () => sender('company'),
    住所: () => sender('address'),
    電話番号: () => sender('phone'),
    メールアドレス: () => sender('email'),
  };
}

const PLACEHOLDER = /【([^】]+)】/g;
const OPTIONAL_SPAN = /〔([^〕]*)〕/g;

/** 文字列中の差し込みを解決する。解決できないものは why を集めて返す */
function fill(
  text: string,
  resolve: Record<string, () => Resolution>,
): { text: string; missing: Missing[] } {
  const missing: Missing[] = [];
  const out = text.replace(PLACEHOLDER, (whole, key: string) => {
    const r = resolve[key]?.() ?? no(`【${key}】の埋め方が決まっていません`, 'input');
    if (r.ok) return r.value;
    missing.push({ why: r.why, kind: r.kind });
    return whole; // 埋めずに残す。呼び出し側が blockers として扱う
  });
  return { text: out, missing };
}

/**
 * 雛形から、その店舗あてのメールを組み立てる。
 *
 * 雛形の1行目が「件名：…」であればそれを件名として切り出す。
 */
export function composeMail(template: string, ctx: MailContext): ComposedMail {
  const resolve = resolvers(ctx);
  const dropped: string[] = [];

  // 1. 〔…〕 を先に処理する。中の差し込みが1つでも埋まらなければ、その span ごと落とす。
  //    ただし落ちた理由が「自分の屋号を入れていない」だけなら dropped には載せない。
  //    店舗のデータが無くて一文を落としたこととは、確認すべきことが別だから。
  //    ここでは **残すか落とすかを決めるだけ** で、中身は置換しない。
  //    置換までしてしまうと、店名に 【】 が含まれる店舗（「【サンプル】〇〇」など）で、
  //    2度目の走査がその 【】 を未解決の差し込みと誤認して送信を止めてしまう。
  const withOptionals = template.replace(OPTIONAL_SPAN, (_whole, inner: string) => {
    const probe = fill(inner, resolve);
    if (probe.missing.length > 0) {
      if (probe.missing.some((m) => m.kind !== 'senderOptional')) dropped.push(inner.trim());
      return '';
    }
    return inner;
  });

  // 2. ここで一度だけ置換する。埋まらなければ送れない
  const filled = fill(withOptionals, resolve);

  // 3. 件名と本文に分ける
  const lines = filled.text.split('\n');
  const first = lines[0] ?? '';
  const hasSubject = first.startsWith('件名：');
  const subject = hasSubject ? first.slice('件名：'.length).trim() : '';
  const body = (hasSubject ? lines.slice(1) : lines).join('\n').replace(/^\n+/, '').trimEnd();

  // 4. 送れない理由を集める
  const blockers: string[] = [];
  const add = (why: string): void => {
    if (!blockers.includes(why)) blockers.push(why);
  };

  const to = ctx.business.email?.value ?? null;
  if (!to) add('宛先のメールアドレスが未取得です（詳細調査を実行すると見つかることがあります）');

  // 法定必須の差出人情報。文面に出てこない項目でも、未設定なら送らせない
  for (const f of SENDER_FIELDS.filter((x) => x.required)) {
    if (ctx.sender[f.key].trim() === '') add(senderMissingReason(f));
  }
  // 埋まらずに残った差し込み。senderMissingReason を共有しているので上と重複しない
  for (const m of filled.missing) add(m.why);

  if (hasSubject && subject === '') add('件名が空です');

  return { to, subject, body, blockers, dropped };
}

/** mailto: のURLを組み立てる。長すぎる本文は環境によって切れるので、その判定も返す */
export function mailtoUrl(mail: ComposedMail): string {
  const params = new URLSearchParams({ subject: mail.subject, body: mail.body });
  return `mailto:${mail.to ?? ''}?${params.toString().replace(/\+/g, '%20')}`;
}

/**
 * mailto: の長さの目安。
 * Windows のシェルは約2000文字で切れることがあるため、超えたら本文のコピーを促す。
 */
export const MAILTO_SAFE_LENGTH = 2000;

export function isMailtoTooLong(mail: ComposedMail): boolean {
  return mailtoUrl(mail).length > MAILTO_SAFE_LENGTH;
}
