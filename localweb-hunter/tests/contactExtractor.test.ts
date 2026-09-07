// メール抽出は「捏造しない」が最重要の仕様。
// 見つからないときに null を返すことを明示的にテストしている。

import { describe, expect, it } from 'vitest';
import { extractEmailsFromHtml, selectBusinessEmail } from '@/lib/analyze/contactExtractor';

describe('extractEmailsFromHtml', () => {
  it('mailto: リンクから抽出する', () => {
    const html = '<a href="mailto:info@sakura-seitai.jp">お問い合わせ</a>';
    const r = extractEmailsFromHtml(html, 'https://sakura-seitai.jp/contact');
    expect(r.map((e) => e.email)).toContain('info@sakura-seitai.jp');
    expect(r[0]?.matchesSiteDomain).toBe(true);
  });

  it('本文テキストからも抽出する', () => {
    const html = '<p>ご連絡は contact@example-shop.jp までお願いします。</p>';
    const r = extractEmailsFromHtml(html, 'https://example-shop.jp/');
    expect(r.map((e) => e.email)).toContain('contact@example-shop.jp');
  });

  it('画像ファイル名やダミーアドレスを誤検出しない', () => {
    const html = `
      <img src="logo@2x.png">
      <p>test@example.com</p>
      <p>noreply@sakura-seitai.jp</p>
    `;
    const emails = extractEmailsFromHtml(html, 'https://sakura-seitai.jp/').map((e) => e.email);
    expect(emails).not.toContain('test@example.com');
    expect(emails).not.toContain('noreply@sakura-seitai.jp');
  });

  it('フリーメールを識別する', () => {
    const html = '<a href="mailto:shop.sakura@gmail.com">メール</a>';
    const r = extractEmailsFromHtml(html, 'https://sakura-seitai.jp/');
    expect(r[0]?.isFreeMail).toBe(true);
    expect(r[0]?.matchesSiteDomain).toBe(false);
  });

  it('メールが無ければ空配列（何も生成しない）', () => {
    expect(extractEmailsFromHtml('<p>お電話ください</p>', 'https://x.jp/')).toEqual([]);
  });
});

describe('selectBusinessEmail', () => {
  const own = { email: 'info@shop.jp', sourceUrl: 'https://shop.jp/', matchesSiteDomain: true, isFreeMail: false };
  const otherOwn = { email: 'a@partner.co.jp', sourceUrl: 'https://shop.jp/', matchesSiteDomain: false, isFreeMail: false };
  const free = { email: 'shop@gmail.com', sourceUrl: 'https://shop.jp/', matchesSiteDomain: false, isFreeMail: true };

  it('候補がなければ null（推測で埋めない）', () => {
    expect(selectBusinessEmail([], { fromOfficialSite: true })).toBeNull();
  });

  it('サイトと同じドメインのメールを最優先する', () => {
    expect(selectBusinessEmail([free, otherOwn, own], { fromOfficialSite: true })?.email).toBe('info@shop.jp');
  });

  it('同ドメインがなければ独自ドメインのメールを選ぶ', () => {
    expect(selectBusinessEmail([free, otherOwn], { fromOfficialSite: true })?.email).toBe('a@partner.co.jp');
  });

  it('フリーメールは公式サイト上で見つかった場合のみ許容する', () => {
    expect(selectBusinessEmail([free], { fromOfficialSite: true })?.email).toBe('shop@gmail.com');
  });

  it('公式サイト以外で拾ったフリーメールは保存しない（個人の私的アドレスの可能性）', () => {
    expect(selectBusinessEmail([free], { fromOfficialSite: false })).toBeNull();
  });
});
