// マイグレーションの回帰テスト。
//
// 背景：schema.sql は CREATE TABLE IF NOT EXISTS で書かれているため、
// 既存DBに対して新しいカラムを足しても反映されず、
// アプリ更新後に「no such column」で実行時に落ちる。
// この事故は実際に発生した。DBを作り直せば直るが、
// それは集めた店舗と営業メモを捨てることを意味する。

import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { migrate } from '@/lib/db/migrate';

/** phone_normalized が存在しなかった頃のスキーマを再現する */
function oldSchemaDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE businesses (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_business_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      lead_score INTEGER NOT NULL DEFAULT 0,
      sales_notes TEXT,
      lead_status TEXT NOT NULL DEFAULT '未接触',
      phase2_completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function columns(db: DatabaseSync): string[] {
  return (db.prepare('PRAGMA table_info(businesses)').all() as Record<string, unknown>[])
    .map((r) => String(r['name']));
}

describe('migrate', () => {
  it('古いDBに不足カラムを追加する', () => {
    const db = oldSchemaDb();
    expect(columns(db)).not.toContain('phone_normalized');

    const report = migrate(db);

    expect(report.addedColumns).toContain('businesses.phone_normalized');
    expect(report.errors).toEqual([]);
    expect(columns(db)).toContain('phone_normalized');
    db.close();
  });

  it('既存の店舗データと営業メモを失わない', () => {
    const db = oldSchemaDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO businesses (id, source, source_business_id, name, phone, lead_score,
        sales_notes, lead_status, created_at, updated_at)
       VALUES ('b1','t','s1','さくら整体院','04-7167-1111',87,'担当者不在。明日再架電','電話済',?,?)`
    ).run(now, now);

    migrate(db);

    const row = db.prepare('SELECT * FROM businesses WHERE id = ?').get('b1') as Record<string, unknown>;
    expect(row['name']).toBe('さくら整体院');
    expect(row['lead_score']).toBe(87);
    expect(row['lead_status']).toBe('電話済');
    expect(row['sales_notes']).toBe('担当者不在。明日再架電');
    db.close();
  });

  it('既存の電話番号を正規化して埋める（更新直後から照合が効くように）', () => {
    const db = oldSchemaDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO businesses (id, source, source_business_id, name, phone, created_at, updated_at)
       VALUES ('b1','t','s1','店','04-7167-1111',?,?)`
    ).run(now, now);

    migrate(db);

    const row = db.prepare('SELECT phone_normalized FROM businesses WHERE id = ?').get('b1') as Record<string, unknown>;
    expect(row['phone_normalized']).toBe('0471671111');
    db.close();
  });

  it('2回流しても壊れない（冪等）', () => {
    const db = oldSchemaDb();
    const first = migrate(db);
    const second = migrate(db);

    expect(first.addedColumns.length).toBeGreaterThan(0);
    expect(second.addedColumns).toEqual([]);
    expect(second.errors).toEqual([]);
    db.close();
  });

  it('最新スキーマで作った新規DBには何もしない', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(readFileSync('src/lib/db/schema.sql', 'utf8'));

    const report = migrate(db);
    expect(report.addedColumns).toEqual([]);
    expect(report.errors).toEqual([]);
    db.close();
  });
});
