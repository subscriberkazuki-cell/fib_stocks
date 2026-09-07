import { describe, expect, it } from 'vitest';
import {
  classifyUrl,
  determineWebsiteStatus,
  extractHostname,
  isMissingOwnWebsite,
  toCandidateUrl,
} from '@/lib/detection/noWebsiteDetection';

describe('extractHostname', () => {
  it('www を落として小文字化する', () => {
    expect(extractHostname('https://WWW.Example.COM/path')).toBe('example.com');
  });

  it('スキームがなくても解釈できる', () => {
    expect(extractHostname('example.com/foo')).toBe('example.com');
  });

  it('URLとして解釈できないものは null', () => {
    // URLコンストラクタは日本語の文もpunycodeのホスト名に変換してしまうので、
    // TLDを持たない文字列は明示的に弾いている
    expect(extractHostname('これはURLではない')).toBeNull();
    expect(extractHostname('localhost')).toBeNull();
    expect(extractHostname('')).toBeNull();
  });
});

describe('classifyUrl', () => {
  it('SNSを判別する', () => {
    expect(classifyUrl('https://www.instagram.com/shop/')).toBe('social');
    expect(classifyUrl('https://x.com/shop')).toBe('social');
    expect(classifyUrl('https://lin.ee/abcdef')).toBe('social');
  });

  it('グルメ・美容ポータルを判別する', () => {
    expect(classifyUrl('https://tabelog.com/chiba/A1207/')).toBe('portal');
    expect(classifyUrl('https://beauty.hotpepper.jp/slnH000/')).toBe('portal');
    expect(classifyUrl('https://www.ekiten.jp/shop_123/')).toBe('portal');
  });

  it('地図プロフィールを独自HPとして扱わない', () => {
    expect(classifyUrl('https://maps.app.goo.gl/xyz')).toBe('map_profile');
    expect(classifyUrl('https://shop.business.site/')).toBe('map_profile');
  });

  it('求人・EC・無料ホスティングを区別する', () => {
    expect(classifyUrl('https://jp.indeed.com/company/x')).toBe('job');
    expect(classifyUrl('https://www.rakuten.co.jp/shop/')).toBe('marketplace');
    expect(classifyUrl('https://myshop.wixsite.com/home')).toBe('free_hosting');
  });

  it('独自ドメインは official とする', () => {
    expect(classifyUrl('https://sakura-seitai.jp/')).toBe('official');
  });

  it('部分文字列一致で誤判定しない', () => {
    // "notgoogle.com" が "google.com" に誤マッチしないこと
    expect(classifyUrl('https://notgoogle.com/')).toBe('official');
    expect(classifyUrl('https://mytabelog.com/')).toBe('official');
  });

  it('サブドメインは親ドメインとして扱う', () => {
    expect(classifyUrl('https://shop.tabelog.com/x')).toBe('portal');
  });
});

describe('determineWebsiteStatus', () => {
  const c = (url: string) => toCandidateUrl(url);

  it('候補が何もなければ none', () => {
    const r = determineWebsiteStatus({ candidates: [], hasProviderWebsiteField: false, officialSiteQuality: null });
    expect(r.status).toBe('none');
  });

  it('SNSだけなら sns_only で、SNSのURLを拾う', () => {
    const r = determineWebsiteStatus({
      candidates: [c('https://instagram.com/shop')],
      hasProviderWebsiteField: false,
      officialSiteQuality: null,
    });
    expect(r.status).toBe('sns_only');
    expect(r.socialUrls).toEqual(['https://instagram.com/shop']);
  });

  it('ポータル1件なら portal_only、2件以上なら multiple_portals', () => {
    expect(
      determineWebsiteStatus({
        candidates: [c('https://tabelog.com/x')],
        hasProviderWebsiteField: false,
        officialSiteQuality: null,
      }).status
    ).toBe('portal_only');

    expect(
      determineWebsiteStatus({
        candidates: [c('https://tabelog.com/x'), c('https://www.ekiten.jp/y')],
        hasProviderWebsiteField: false,
        officialSiteQuality: null,
      }).status
    ).toBe('multiple_portals');
  });

  it('地図プロフィールしかなければ profile_only', () => {
    expect(
      determineWebsiteStatus({
        candidates: [c('https://maps.app.goo.gl/x')],
        hasProviderWebsiteField: false,
        officialSiteQuality: null,
      }).status
    ).toBe('profile_only');
  });

  it('公式サイトがあり品質未調査なら low_quality 側に倒す（除外しない）', () => {
    const r = determineWebsiteStatus({
      candidates: [c('https://sakura-seitai.jp/')],
      hasProviderWebsiteField: true,
      officialSiteQuality: null,
    });
    expect(r.status).toBe('official_low_quality');
    expect(r.officialUrl).toBe('https://sakura-seitai.jp/');
  });

  it('品質が good と実測できたときだけ official_good になる', () => {
    const r = determineWebsiteStatus({
      candidates: [c('https://sakura-seitai.jp/')],
      hasProviderWebsiteField: true,
      officialSiteQuality: 'good',
    });
    expect(r.status).toBe('official_good');
  });

  it('無料ホスティングは独自HPとして扱わない', () => {
    const r = determineWebsiteStatus({
      candidates: [c('https://myshop.wixsite.com/home')],
      hasProviderWebsiteField: false,
      officialSiteQuality: null,
    });
    expect(r.status).toBe('portal_only');
    expect(r.officialUrl).toBeNull();
  });
});

describe('isMissingOwnWebsite', () => {
  it('公式サイトがある状態だけ false', () => {
    expect(isMissingOwnWebsite('none')).toBe(true);
    expect(isMissingOwnWebsite('sns_only')).toBe(true);
    expect(isMissingOwnWebsite('portal_only')).toBe(true);
    expect(isMissingOwnWebsite('multiple_portals')).toBe(true);
    expect(isMissingOwnWebsite('profile_only')).toBe(true);
    expect(isMissingOwnWebsite('official_low_quality')).toBe(false);
    expect(isMissingOwnWebsite('official_good')).toBe(false);
  });
});
