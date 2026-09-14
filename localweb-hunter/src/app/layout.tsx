import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'LocalWeb Hunter',
  description: '地域店舗のWebプレゼンスを調べ、HP制作営業の見込み客リストを作るローカル実行ツール',
};

const NAV = [
  { href: '/', label: '検索' },
  { href: '/leads', label: 'リード一覧' },
  { href: '/playbook', label: '営業手順' },
  { href: '/costs', label: 'コスト' },
  { href: '/metrics', label: '営業指標' },
  { href: '/settings', label: '設定' },
  { href: '/about', label: '利用目的' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              LocalWeb Hunter
            </Link>
            <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="text-stone-600 hover:text-stone-900">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-stone-500">
          公開情報のみを利用しています。電話番号・メールアドレスは推測生成せず、確認できたものだけを保存しています。
          <Link href="/about" className="ml-1 underline">
            利用目的について
          </Link>
        </footer>
      </body>
    </html>
  );
}
