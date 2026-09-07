// 電話番号の正規化。重複排除の照合に使う（§10-1）。
//
// 注意: ここで「正規化して一致したら同じ店」と結論してはいけない。
// テナントビルの代表番号やチェーン店の本部番号が同一のケースがあるため、
// 一致は「候補」でしかない。統合の可否は dedupe.ts の複合条件で決める。

/**
 * 日本の電話番号を「先頭0の国内形式・ハイフンなし」に統一する。
 * 判定できない形式は null を返す（無理に整形しない）。
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // 全角数字・全角ハイフンを半角化
  let s = raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[‐‑‒–—―ー－]/g, '-');

  // 内線表記など、番号の後ろに付く情報は切り落とす
  s = s.split(/[(（]/)[0] ?? s;

  // 数字と先頭の + だけ残す
  const hasPlus = s.trim().startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (digits.length === 0) return null;

  let national: string;
  if (hasPlus && digits.startsWith('81')) {
    national = `0${digits.slice(2)}`;
  } else if (digits.startsWith('0081')) {
    national = `0${digits.slice(4)}`;
  } else if (digits.startsWith('81') && digits.length >= 11 && !digits.startsWith('810')) {
    // 国番号81が先頭に付いた形。ただし "81" で始まる国内番号は存在しないので安全に判定できる
    national = `0${digits.slice(2)}`;
  } else if (digits.startsWith('0')) {
    national = digits;
  } else {
    // 市外局番が落ちている等、国内形式に確定できないものは照合に使わない
    return null;
  }

  // 日本の固定・携帯は10桁または11桁
  if (national.length !== 10 && national.length !== 11) return null;
  return national;
}

/** フリーダイヤル・ナビダイヤル等は店舗固有でないことがあり、照合の根拠として弱い */
const WEAK_PREFIXES = ['0120', '0570', '0800', '0990'];

export function isWeakPhoneForMatching(normalized: string | null): boolean {
  if (!normalized) return true;
  return WEAK_PREFIXES.some((p) => normalized.startsWith(p));
}
