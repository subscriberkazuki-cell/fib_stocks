// Web検索の抽象化（§7 Stage 2 / §5 設計原則）
//
// Google Custom Search と Brave Search のどちらを使うかは環境変数で切り替える。
// 無料枠の比較は docs/ARCHITECTURE.md にまとめてある。

export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
}

export interface WebSearchProvider {
  readonly name: string;
  readonly billable: boolean;
  /** 無料枠を使い切った場合など、検索できないときは空配列を返す（例外にしない） */
  search(query: string, limit: number): Promise<SearchHit[]>;
  /** 1クエリあたりのコスト。無料枠内なら0 */
  costPerQuery(): number;
  isConfigured(): boolean;
}

/** 検索プロバイダ未設定時。Stage 2 をスキップし、Stage 1 の結果だけで判定する */
export class NullSearchProvider implements WebSearchProvider {
  readonly name = 'none';
  readonly billable = false;
  async search(): Promise<SearchHit[]> {
    return [];
  }
  costPerQuery(): number {
    return 0;
  }
  isConfigured(): boolean {
    return false;
  }
}
