/**
 * A D1Database stand-in over node:sqlite, for tests that need the Worker's
 * real SQL against the real schema. Local and in-memory only.
 *
 * It covers what worker/buildings.ts uses: prepare().bind().run/first/all
 * and batch(). batch() is one transaction that rolls back whole on an error,
 * as D1's is. Every file in migrations/ is applied in order, the way wrangler
 * would, so a query that disagrees with the schema fails here too.
 */
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

type Value = string | number | bigint | null | Uint8Array;

class Statement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    readonly params: Value[] = [],
  ) {}

  bind(...params: unknown[]): Statement {
    return new Statement(this.db, this.sql, params.map((p) => (p === undefined ? null : (p as Value))));
  }

  runNow() {
    const out = this.db.prepare(this.sql).run(...this.params);
    return {success: true, results: [], meta: {changes: Number(out.changes), last_row_id: Number(out.lastInsertRowid)}};
  }

  async run() {
    return this.runNow();
  }

  async all<T>() {
    return {success: true, results: this.db.prepare(this.sql).all(...this.params) as T[], meta: {changes: 0}};
  }

  async first<T>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : {...row}) as T;
  }
}

export interface TestD1 {
  db: D1Database;
  raw: DatabaseSync;
}

export function migratedD1(): TestD1 {
  const raw = new DatabaseSync(':memory:');
  const dir = join(import.meta.dirname, '..', '..', '..', 'migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(join(dir, file), 'utf8'));
  }
  const db = {
    prepare: (sql: string) => new Statement(raw, sql),
    batch: async (statements: Statement[]) => {
      raw.exec('BEGIN');
      try {
        const out = statements.map((s) => s.runNow());
        raw.exec('COMMIT');
        return out;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
    exec: async (sql: string) => raw.exec(sql),
  };
  return {db: db as unknown as D1Database, raw};
}
