import { describe, expect, it } from 'vitest';
import { isWeakPhoneForMatching, normalizePhone } from '@/lib/dedupe/phone';

describe('normalizePhone', () => {
  it('ハイフン・空白・括弧を除去して国内形式に揃える', () => {
    expect(normalizePhone('04-7167-1111')).toBe('0471671111');
    expect(normalizePhone('04 7167 1111')).toBe('0471671111');
    expect(normalizePhone('0471671111')).toBe('0471671111');
  });

  it('国番号付きを国内形式に変換する', () => {
    expect(normalizePhone('+81-4-7167-1111')).toBe('0471671111');
    expect(normalizePhone('+814716711111')).toBe('04716711111');
    expect(normalizePhone('0081471671111')).toBe('0471671111');
  });

  it('全角数字・全角ハイフンを扱える', () => {
    expect(normalizePhone('０４－７１６７－１１１１')).toBe('0471671111');
    expect(normalizePhone('090ー1234ー5678')).toBe('09012345678');
  });

  it('内線などの付加情報を切り落とす', () => {
    expect(normalizePhone('04-7167-1111（内線123）')).toBe('0471671111');
    expect(normalizePhone('04-7167-1111 (代表)')).toBe('0471671111');
  });

  it('携帯番号（11桁）を扱える', () => {
    expect(normalizePhone('090-1234-5678')).toBe('09012345678');
  });

  it('国内形式に確定できないものは null を返す（無理に整形しない）', () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('お問い合わせください')).toBeNull();
    expect(normalizePhone('123')).toBeNull();          // 短すぎる
    expect(normalizePhone('471671111')).toBeNull();    // 先頭0がない
    expect(normalizePhone('04-7167-11111111')).toBeNull(); // 桁が多すぎる
  });
});

describe('isWeakPhoneForMatching', () => {
  it('フリーダイヤル・ナビダイヤルは照合の根拠として弱い', () => {
    expect(isWeakPhoneForMatching('0120123456')).toBe(true);
    expect(isWeakPhoneForMatching('0570001234')).toBe(true);
    expect(isWeakPhoneForMatching('0800123456')).toBe(true);
  });

  it('通常の固定電話は照合に使える', () => {
    expect(isWeakPhoneForMatching('0471671111')).toBe(false);
  });

  it('null は照合に使えない', () => {
    expect(isWeakPhoneForMatching(null)).toBe(true);
  });
});
