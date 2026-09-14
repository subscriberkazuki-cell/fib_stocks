// ローカルDBの初期化。
//   node scripts/init-db.mjs           … スキーマ適用（既存データは残す）
//   node scripts/init-db.mjs --reset   … DBファイルを削除してから作り直す
//
// npm run dev の初回起動時にも自動でスキーマは適用されるので、
// このスクリプトは「作り直したい」ときのためのもの。

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = resolve(process.env.SQLITE_PATH ?? './data/localweb-hunter.db');
const schemaPath = resolve('src/lib/db/schema.sql');

if (process.argv.includes('--reset') && existsSync(dbPath)) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const p = `${dbPath}${suffix}`;
    if (existsSync(p)) rmSync(p);
  }
  console.log(`削除しました: ${dbPath}`);
}

mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(readFileSync(schemaPath, 'utf8'));

// schema.sql は CREATE TABLE IF NOT EXISTS なので、既存DBには新カラムが入らない。
// 足りないカラムを ALTER TABLE で補う（既存データは保持される）。
const additions = [
  { table: 'businesses', column: 'phone_normalized', definition: 'TEXT',
    backfill: "UPDATE businesses SET phone_normalized = replace(replace(phone,'-',''),' ','') WHERE phone IS NOT NULL AND phone_normalized IS NULL" },
];
for (const a of additions) {
  const cols = db.prepare(`PRAGMA table_info(${a.table})`).all().map((r) => r.name);
  if (cols.length > 0 && !cols.includes(a.column)) {
    db.exec(`ALTER TABLE ${a.table} ADD COLUMN ${a.column} ${a.definition}`);
    if (a.backfill) db.exec(a.backfill);
    console.log(`カラムを追加しました: ${a.table}.${a.column}`);
  }
}
db.exec('CREATE INDEX IF NOT EXISTS idx_businesses_phase2 ON businesses(phase2_completed_at, lead_score DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_businesses_phone ON businesses(phone_normalized)');

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all()
  .map((r) => r.name)
  .filter((n) => !n.startsWith('sqlite_'));

console.log(`DBを初期化しました: ${dbPath}`);
console.log(`テーブル: ${tables.join(', ')}`);
db.close();
