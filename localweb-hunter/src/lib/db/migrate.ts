// スキーマのマイグレーション。
//
// なぜ必要か：
//   schema.sql は CREATE TABLE IF NOT EXISTS で書かれているため、
//   **既にテーブルが存在する場合、後から追加したカラムは反映されない。**
//   その状態でアプリを更新すると「no such column」で実行時に落ちる。
//   DBを作り直せば直るが、それは集めた店舗と営業メモを捨てることになる。
//
// SQLite には堅牢なマイグレーション機構がないので、
// 「現在のカラム一覧を読んで、足りないものだけ ALTER TABLE ADD COLUMN する」
// という素朴だが確実な方式を採る。既存データは保持される。
//
// 新しいカラムを schema.sql に足したら、この表にも1行足すこと。

import 'server-only';
import type { DatabaseSync } from 'node:sqlite';

interface ColumnAddition {
  table: string;
  column: string;
  /** ALTER TABLE ADD COLUMN に渡す定義。DEFAULT 付きの NOT NULL のみ許される点に注意 */
  definition: string;
  /** 追加後に既存行を埋めるための SQL（任意） */
  backfill?: string;
}

const COLUMN_ADDITIONS: ColumnAddition[] = [
  {
    table: 'businesses',
    column: 'phone_normalized',
    definition: 'TEXT',
    // 既存行は起動時に埋められないので、次回の upsert で入る。
    // ただしハイフン・空白だけは即座に落としておくと、当面の照合精度が上がる。
    backfill: `UPDATE businesses
               SET phone_normalized = replace(replace(phone, '-', ''), ' ', '')
               WHERE phone IS NOT NULL AND phone_normalized IS NULL`,
  },
];

const INDEX_ADDITIONS: string[] = [
  'CREATE INDEX IF NOT EXISTS idx_businesses_phase2 ON businesses(phase2_completed_at, lead_score DESC)',
  'CREATE INDEX IF NOT EXISTS idx_businesses_phone ON businesses(phone_normalized)',
];

function tableExists(db: DatabaseSync, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(table);
  return row !== undefined;
}

function columnNames(db: DatabaseSync, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Record<string, unknown>[];
  return new Set(rows.map((r) => String(r['name'])));
}

export interface MigrationReport {
  addedColumns: string[];
  errors: string[];
}

/** 既存DBを最新スキーマに合わせる。新規DBに対しては何もしない（schema.sql が全部作る） */
export function migrate(db: DatabaseSync): MigrationReport {
  const report: MigrationReport = { addedColumns: [], errors: [] };

  for (const add of COLUMN_ADDITIONS) {
    if (!tableExists(db, add.table)) continue;
    if (columnNames(db, add.table).has(add.column)) continue;

    try {
      db.exec(`ALTER TABLE ${add.table} ADD COLUMN ${add.column} ${add.definition}`);
      if (add.backfill) db.exec(add.backfill);
      report.addedColumns.push(`${add.table}.${add.column}`);
    } catch (e) {
      report.errors.push(
        `${add.table}.${add.column} の追加に失敗: ${e instanceof Error ? e.message : '不明なエラー'}`
      );
    }
  }

  for (const sql of INDEX_ADDITIONS) {
    try {
      db.exec(sql);
    } catch (e) {
      report.errors.push(`インデックス作成に失敗: ${e instanceof Error ? e.message : '不明なエラー'}`);
    }
  }

  return report;
}
