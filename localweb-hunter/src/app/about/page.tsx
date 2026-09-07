// 利用目的の明示（§2-4）
// 個人事業主の連絡先は個人情報保護法上の個人情報に該当し得るため、
// 何のために取得・保管しているかを明示するページを用意している。

export const metadata = {
  title: '利用目的について | LocalWeb Hunter',
};

export default function AboutPage(): React.ReactElement {
  return (
    <div className="prose prose-stone max-w-none space-y-6">
      <div>
        <h1 className="text-2xl font-bold">このツールの利用目的とデータの扱い</h1>
        <p className="mt-2 text-sm text-stone-600">最終更新: このページを含むバージョンの公開時点</p>
      </div>

      <section className="card space-y-2">
        <h2 className="text-lg font-semibold">利用目的</h2>
        <p className="text-sm">
          本ツールは、ホームページ制作サービスの見込み客を管理する目的で、
          公開されている店舗情報を収集・整理しています。
          具体的には「Web上に十分な情報がなく、来店を検討している方が
          営業時間やサービス内容を確認できない状態の店舗」を見つけ、
          その改善提案につなげるために利用します。
        </p>
      </section>

      <section className="card space-y-2">
        <h2 className="text-lg font-semibold">取得する情報</h2>
        <ul className="ml-5 list-disc text-sm">
          <li>店舗名・業種・住所・座標</li>
          <li>公開されている評価・レビュー件数</li>
          <li>公開されている電話番号</li>
          <li>公式サイト上に事業用として公開されているメールアドレス</li>
          <li>公式サイト・SNSアカウントのURL、およびサイトの技術的な状態</li>
        </ul>
        <p className="text-sm">
          いずれも、一般に公開されている情報のみを対象としています。
        </p>
      </section>

      <section className="card space-y-2">
        <h2 className="text-lg font-semibold">行わないこと</h2>
        <ul className="ml-5 list-disc text-sm">
          <li>
            <strong>連絡先の推測生成</strong>：店名やドメインからメールアドレスを組み立てるようなことはしません。
            実際に確認できたものだけを保存し、見つからない場合は「未確認」と表示します。
          </li>
          <li>
            <strong>Google Maps のWebページのスクレイピング</strong>：ブラウザ自動操作による取得は行いません。
          </li>
          <li>
            <strong>robots.txt を無視したアクセス</strong>：取得前に必ず確認し、
            許可されていないパスにはアクセスしません。確認できなかった場合もアクセスを見送ります。
          </li>
          <li>
            <strong>営業メールの自動一斉送信</strong>：本バージョンには実装されていません。
            メールアドレスの取得・表示までにとどめています。
          </li>
          <li>
            <strong>事業用と判断できない個人のメールアドレスの蓄積</strong>：
            フリーメールは、公式サイト上に事業用の連絡先として掲載されている場合を除き保存しません。
          </li>
          <li>
            <strong>取得したデータの第三者への提供・再販</strong>：行いません。
          </li>
        </ul>
      </section>

      <section className="card space-y-2">
        <h2 className="text-lg font-semibold">サイトへのアクセスについて</h2>
        <p className="text-sm">
          店舗の公式サイトを調べる際は、以下を守っています。
        </p>
        <ul className="ml-5 list-disc text-sm">
          <li>同一ドメインへのリクエストは2秒以上の間隔を空ける（robots.txt の Crawl-delay がより長ければそちらに従う）</li>
          <li>User-Agent に識別子と連絡先URLを含める</li>
          <li>タイムアウト10秒・リトライ最大2回</li>
          <li>1店舗あたりのアクセスページ数に上限を設ける</li>
        </ul>
      </section>

      <section className="card space-y-2">
        <h2 className="text-lg font-semibold">AI が生成した内容について</h2>
        <p className="text-sm">
          営業理由・営業トーク・提案内容はAIが生成した推定であり、実データとは区別して保存・表示しています。
          画面上では「AI生成（要確認）」と明示されます。事実確認をしたうえでご利用ください。
        </p>
      </section>

      <section className="card space-y-2">
        <h2 className="text-lg font-semibold">削除・訂正のご依頼</h2>
        <p className="text-sm">
          掲載情報の削除・訂正をご希望の店舗様は、本ツールの運用者までご連絡ください。
          該当するレコードを削除します。
        </p>
        <p className="text-sm text-stone-600">
          ※ 連絡先は運用者ご自身のものに書き換えてください（
          <code className="rounded bg-stone-100 px-1">src/app/about/page.tsx</code>）。
          また <code className="rounded bg-stone-100 px-1">CRAWLER_USER_AGENT</code> のURLも、
          このページを指すように設定してください。
        </p>
      </section>
    </div>
  );
}
