// SQLite接続。Node 22.5+ 組み込みの node:sqlite を使うので、
// ネイティブビルドも追加パッケージも不要（＝アカウント作成なしですぐ動く）。

import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { env } from '@/config/env';
import { migrate } from './migrate';

let db: DatabaseSync | null = null;

function schemaPath(): string {
  return resolve(process.cwd(), 'src/lib/db/schema.sql');
}

export function getDb(): DatabaseSync {
  if (db) return db;

  const path = resolve(process.cwd(), env.storage.sqlitePath);
  mkdirSync(dirname(path), { recursive: true });

  const conn = new DatabaseSync(path);
  // schema.sql は CREATE TABLE IF NOT EXISTS なので、既存DBには新カラムが入らない。
  // migrate() が足りないカラムを ALTER TABLE で補う（既存データは保持される）。
  conn.exec(readFileSync(schemaPath(), 'utf8'));
  const report = migrate(conn);
  if (report.addedColumns.length > 0) {
    console.log(`[localweb-hunter] DBを更新しました: ${report.addedColumns.join(', ')}`);
  }
  for (const err of report.errors) console.error(`[localweb-hunter] ${err}`);

  db = conn;
  return conn;
}

/** テストや初期化スクリプトから、任意パスのDBを開くための入口 */
export function openDbAt(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const conn = new DatabaseSync(path);
  conn.exec(readFileSync(schemaPath(), 'utf8'));
  migrate(conn);
  return conn;
}

export function closeDb(): void {
  db?.close();
  db = null;
}
