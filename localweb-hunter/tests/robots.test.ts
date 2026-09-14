// robots.txt の解釈を間違えると、相手のサーバーに迷惑をかける。
// 「迷ったらアクセスしない」側に倒っていることを確認する。

import { describe, expect, it } from 'vitest';
import { isAllowed, parseRobots } from '@/lib/crawler/robots';
import { isLoopbackHost } from '@/lib/crawler/httpClient';

const UA = 'LocalWebHunter/0.2 (+https://example.com/about)';

describe('parseRobots', () => {
  it('User-agent: * のルールを読む', () => {
    const r = parseRobots('User-agent: *\nDisallow: /admin/\nCrawl-delay: 5', UA);
    expect(r.disallow).toEqual(['/admin/']);
    expect(r.crawlDelaySec).toBe(5);
  });

  it('自分のUA向けの指定があればそちらを優先する', () => {
    const txt = [
      'User-agent: *',
      'Disallow: /',
      '',
      'User-agent: LocalWebHunter',
      'Disallow: /private/',
    ].join('\n');
    const r = parseRobots(txt, UA);
    expect(r.disallow).toEqual(['/private/']);
  });

  it('複数UAが連続するグループを正しく扱う', () => {
    const txt = ['User-agent: Googlebot', 'User-agent: *', 'Disallow: /x/'].join('\n');
    expect(parseRobots(txt, UA).disallow).toEqual(['/x/']);
  });

  it('コメントを無視する', () => {
    const r = parseRobots('User-agent: * # すべて\nDisallow: /a/ # 管理画面', UA);
    expect(r.disallow).toEqual(['/a/']);
  });

  it('robots.txt が空ならルールなし', () => {
    expect(parseRobots('', UA).disallow).toEqual([]);
  });
});

describe('isAllowed', () => {
  it('Disallow に一致するパスを拒否する', () => {
    const r = parseRobots('User-agent: *\nDisallow: /admin/', UA);
    expect(isAllowed(r, '/admin/users')).toBe(false);
    expect(isAllowed(r, '/about')).toBe(true);
  });

  it('Disallow: / はすべて拒否', () => {
    const r = parseRobots('User-agent: *\nDisallow: /', UA);
    expect(isAllowed(r, '/')).toBe(false);
    expect(isAllowed(r, '/anything')).toBe(false);
  });

  it('Disallow:（空）は制限なしを意味する', () => {
    const r = parseRobots('User-agent: *\nDisallow:', UA);
    expect(isAllowed(r, '/anything')).toBe(true);
  });

  it('より具体的な Allow が Disallow に勝つ', () => {
    const r = parseRobots('User-agent: *\nDisallow: /private/\nAllow: /private/public/', UA);
    expect(isAllowed(r, '/private/secret')).toBe(false);
    expect(isAllowed(r, '/private/public/page')).toBe(true);
  });

  it('ワイルドカードを解釈する', () => {
    const r = parseRobots('User-agent: *\nDisallow: /*.pdf$', UA);
    expect(isAllowed(r, '/docs/a.pdf')).toBe(false);
    expect(isAllowed(r, '/docs/a.html')).toBe(true);
  });

  it('$ による終端一致を解釈する', () => {
    const r = parseRobots('User-agent: *\nDisallow: /search$', UA);
    expect(isAllowed(r, '/search')).toBe(false);
    expect(isAllowed(r, '/searchresults')).toBe(true);
  });
});

describe('isLoopbackHost', () => {
  // クロール間隔の例外はループバックだけに効くこと。
  // ここが緩いと、よそのサーバーに対する2秒制限が抜ける。
  it('自分自身のホストを判定する', () => {
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
    expect(isLoopbackHost('LOCALHOST')).toBe(true);
  });

  it('外部ホストを誤ってループバック扱いしない', () => {
    expect(isLoopbackHost('example.com')).toBe(false);
    expect(isLoopbackHost('localhost.example.com')).toBe(false);
    expect(isLoopbackHost('notlocalhost')).toBe(false);
    expect(isLoopbackHost('127.0.0.1.example.com')).toBe(false);
    expect(isLoopbackHost('my-localhost.jp')).toBe(false);
    expect(isLoopbackHost('192.168.1.1')).toBe(false);
  });
});
