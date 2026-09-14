import Link from 'next/link';
import { PROCEDURE, TALK_STRUCTURE, CALL_TIMING } from '@/config/procedure';
import { INDUSTRY_APPROACHES, OBJECTIONS } from '@/config/approaches';
import { LP_OFFERINGS, SITE_OFFERINGS, hasAnyPriceConfigured, priceLabel } from '@/config/offerings';

export const metadata = { title: '営業手順 | LocalWeb Hunter' };

export default function PlaybookPage(): React.ReactElement {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">営業手順とアプローチ</h1>
        <p className="mt-1 text-sm text-stone-600">
          リストを開いてから成約までの流れと、業種ごとの切り口をまとめています。
          刺さった切り口が分かったら <code className="rounded bg-stone-100 px-1 text-xs">src/config/approaches.ts</code>{' '}
          に書き足していってください。
        </p>
      </div>

      <nav className="card flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="font-medium">目次</span>
        {[
          ['#procedure', '営業手順（7ステップ）'],
          ['#talk', '電話トークの型'],
          ['#timing', 'かける時間帯'],
          ['#industry', '業種別アプローチ'],
          ['#objection', '断られたときの対応'],
          ['#offerings', '提案プラン一覧'],
        ].map(([href, label]) => (
          <a key={href} href={href} className="text-stone-600 underline hover:text-stone-900">
            {label}
          </a>
        ))}
      </nav>

      {/* ============ 営業手順 ============ */}
      <section id="procedure" className="space-y-3 scroll-mt-4">
        <h2 className="text-xl font-bold">営業手順</h2>
        <p className="text-sm text-stone-600">
          この順番を崩さないこと。特に <strong>ステップ5（すぐ記録する）</strong> を飛ばすと、
          営業指標が機能しなくなり「どのスコアの店が成約したか」を検証できなくなります。
        </p>

        {PROCEDURE.map((step) => (
          <div key={step.no} className="card space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-900 text-sm font-bold text-white">
                {step.no}
              </span>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              {step.where && (
                <Link href={step.where.href} className="btn-secondary ml-auto text-xs">
                  {step.where.label}を開く →
                </Link>
              )}
            </div>

            <ul className="ml-5 list-disc space-y-1 text-sm">
              {step.what.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>

            <div className="rounded-md bg-stone-50 p-3">
              <p className="text-xs font-medium text-stone-500">なぜそうするか</p>
              <p className="text-sm">{step.why}</p>
            </div>

            <div className="rounded-md bg-red-50 p-3">
              <p className="text-xs font-medium text-red-900">よくある失敗</p>
              <p className="text-sm text-red-950">{step.pitfall}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ============ トークの型 ============ */}
      <section id="talk" className="space-y-3 scroll-mt-4">
        <h2 className="text-xl font-bold">電話トークの型（60秒）</h2>
        <p className="text-sm text-stone-600">
          最初の電話の目的は「売ること」ではなく「話を聞いてもらえる状態を作ること」です。
          店舗ごとの具体的なトークは、各リードの詳細画面に生成されています。
        </p>

        <div className="space-y-2">
          {TALK_STRUCTURE.map((t) => (
            <div key={t.phase} className="card">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-semibold">{t.phase}</span>
                <span className="badge bg-stone-100 text-stone-600">{t.seconds}</span>
                <span className="text-sm text-stone-600">{t.goal}</span>
              </div>
              <p className="mt-2 rounded bg-stone-50 p-2 text-sm">{t.example}</p>
              <p className="mt-1 text-xs text-stone-600">{t.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ 時間帯 ============ */}
      <section id="timing" className="space-y-3 scroll-mt-4">
        <h2 className="text-xl font-bold">かける時間帯</h2>
        <p className="text-sm text-stone-600">
          忙しい時間にかけるのは営業妨害です。繋がらないだけでなく、地域での評判にも関わります。
        </p>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="text-xs text-stone-500">
              <tr>
                <th className="py-2">業種</th>
                <th>狙う時間</th>
                <th>避ける時間</th>
                <th>理由</th>
              </tr>
            </thead>
            <tbody>
              {CALL_TIMING.map((c) => (
                <tr key={c.category} className="border-t border-stone-100 align-top">
                  <td className="py-2 font-medium">{c.category}</td>
                  <td className="py-2 text-emerald-700">{c.good}</td>
                  <td className="py-2 text-red-700">{c.avoid}</td>
                  <td className="py-2 text-stone-600">{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ============ 業種別 ============ */}
      <section id="industry" className="space-y-3 scroll-mt-4">
        <h2 className="text-xl font-bold">業種別アプローチ</h2>
        <p className="text-sm text-stone-600">
          「ホームページを作りませんか」は、どの業種に言っても同じように弱い切り口です。
          相手が困っているのはWebではなく商売の方なので、その業種で実際に起きている
          取りこぼしから入ります。
        </p>

        <div className="grid gap-3 lg:grid-cols-2">
          {INDUSTRY_APPROACHES.map((a) => (
            <div key={a.category} className="card space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{a.category}</h3>
                <span
                  className={`badge ${a.primaryKind === 'lp' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'}`}
                >
                  {a.primaryKind === 'lp' ? '販売ページから' : '公式サイトから'}
                </span>
              </div>

              <div>
                <p className="text-xs font-medium text-stone-500">起きている取りこぼし</p>
                <p className="text-sm">{a.painPoint}</p>
              </div>

              <div className="rounded-md bg-amber-50 p-2">
                <p className="text-xs font-medium text-amber-900">切り口</p>
                <p className="text-sm text-amber-950">「{a.hook}」</p>
              </div>

              <div className="rounded-md bg-red-50 p-2">
                <p className="text-xs font-medium text-red-900">注意点</p>
                <p className="text-sm text-red-950">{a.caution}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ 断り対応 ============ */}
      <section id="objection" className="space-y-3 scroll-mt-4">
        <h2 className="text-xl font-bold">断られたときの対応</h2>
        <div className="card bg-stone-50 text-sm">
          <p className="font-medium">前提：食い下がるための資料ではありません。</p>
          <p className="mt-1 text-stone-700">
            相手が本当に不要なら引くのが正しい判断です。1件に粘る時間で3件かけた方が成果が出ますし、
            地域で商売をしている以上、評判を守ることの方が長期的には大事です。
            各項目の「引くべきサイン」を必ず見てください。
          </p>
        </div>

        <div className="space-y-2">
          {OBJECTIONS.map((o) => (
            <div key={o.said} className="card space-y-2">
              <p className="font-semibold">「{o.said}」</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-stone-500">相手の本音</p>
                  <p className="text-sm">{o.meaning}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-500">返し方</p>
                  <p className="text-sm">{o.response}</p>
                </div>
              </div>
              <div className="rounded-md bg-stone-100 p-2">
                <p className="text-xs font-medium text-stone-600">引くべきサイン</p>
                <p className="text-sm">{o.stopIf}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ プラン ============ */}
      <section id="offerings" className="space-y-3 scroll-mt-4">
        <h2 className="text-xl font-bold">提案プラン一覧</h2>

        <div className="card bg-stone-50 text-sm">
          <p className="font-medium">公式サイトと販売ページは目的が違います</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md bg-white p-3">
              <span className="badge bg-emerald-100 text-emerald-800">公式サイト</span>
              <p className="mt-1">
                店名で検索されたときの<strong>受け皿</strong>。信頼性と基本情報。常設で、
                継続的に流入を受ける資産になる。
              </p>
            </div>
            <div className="rounded-md bg-white p-3">
              <span className="badge bg-sky-100 text-sky-800">販売ページ（LP）</span>
              <p className="mt-1">
                1つの商品・コース・キャンペーンを<strong>売り切る</strong>1枚。
                行動は1つだけ。広告やSNSから直接送れる。
              </p>
            </div>
          </div>
          <p className="mt-2 text-stone-700">
            SNSで集客できている店に5ページのHPを提案しても「今で足りてる」で終わりますが、
            「初回体験の申込ページ」なら来月の予約数の話になります。何を提案するかの判断は、
            各リードの詳細画面の「次の一手」が自動で出しています。
          </p>
        </div>

        {!hasAnyPriceConfigured() && (
          <div className="card bg-amber-50 text-sm text-amber-900">
            <p className="font-medium">価格が未設定です</p>
            <p className="mt-1">
              <code className="rounded bg-white px-1 text-xs">src/config/offerings.ts</code> の{' '}
              <code className="rounded bg-white px-1 text-xs">PRICE_HINTS</code> にご自身の価格帯を設定してください。
              根拠のない金額を画面に出さないよう、未設定の間は「未設定」と表示しています。
            </p>
          </div>
        )}

        {[
          { title: '公式サイト', items: SITE_OFFERINGS, style: 'bg-emerald-100 text-emerald-800' },
          { title: '販売ページ（LP）', items: LP_OFFERINGS, style: 'bg-sky-100 text-sky-800' },
        ].map((group) => (
          <div key={group.title} className="space-y-2">
            <h3 className="font-semibold">{group.title}</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {group.items.map((o) => (
                <div key={o.key} className="card space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${group.style}`}>{group.title}</span>
                    <h4 className="font-semibold">{o.name}</h4>
                  </div>
                  <p className="text-sm text-stone-600">{o.summary}</p>

                  <div>
                    <p className="text-xs font-medium text-stone-500">こういう店に</p>
                    <p className="text-sm">{o.whenToUse}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-stone-500">相手にとっての価値</p>
                    <p className="text-sm">{o.valueToClient}</p>
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm">
                    <span>
                      <span className="text-stone-500">期間 </span>
                      {o.leadTimeWeeks}
                    </span>
                    <span>
                      <span className="text-stone-500">価格 </span>
                      {priceLabel(o.key) === '未設定' ? (
                        <span className="text-stone-400">未設定</span>
                      ) : (
                        priceLabel(o.key)
                      )}
                    </span>
                  </div>

                  <details className="text-sm">
                    <summary className="cursor-pointer text-stone-600">納品物</summary>
                    <ul className="ml-4 mt-1 list-disc text-sm">
                      {o.deliverables.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="card bg-stone-900 text-white">
        <p className="font-medium">最後に</p>
        <p className="mt-1 text-sm text-stone-300">
          ここに書いた時間帯や切り口は出発点です。実際にかけてみて反応が違ったら、
          <code className="rounded bg-stone-700 px-1 text-xs">src/config/approaches.ts</code> と{' '}
          <code className="rounded bg-stone-700 px-1 text-xs">src/config/procedure.ts</code>{' '}
          を書き換えてください。正解は地域と時期で変わります。
          自分の実数は <Link href="/metrics" className="underline">営業指標</Link> で確認できます。
        </p>
      </div>
    </div>
  );
}
