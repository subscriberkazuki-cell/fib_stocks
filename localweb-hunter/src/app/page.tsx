import Link from 'next/link';
import { SearchForm } from '@/components/SearchForm';

export const dynamic = 'force-dynamic';

export default function HomePage(): React.ReactElement {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">店舗を探す</h1>
        <p className="mt-1 text-sm text-stone-600">
          評価が高く商売が成立している一方で、Web上の営業基盤が弱い店舗を見つけます。
          結果は <Link href="/leads" className="underline">リード一覧</Link> に蓄積されます。
        </p>
      </div>
      <SearchForm />
    </div>
  );
}
