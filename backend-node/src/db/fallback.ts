import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { getConfig, type AppConfig } from '../config/index.js';
import { DatabaseUnavailableError, SQLITE_FALLBACK_PROHIBITED } from './errors.js';
import { toVectorLiteral } from './rpc.js';

/**
 * Local SQLite fallback, ported from `backend/app/rag/fallback_db.py`.
 *
 * Purpose: offline development and vector/embedding search when Supabase is
 * unreachable. It is strictly prohibited in production (503), matching
 * `FallbackSupabaseClient.__init__`.
 *
 * Preserved behaviors:
 * - WAL, NORMAL synchronous, foreign keys and a 30 s busy timeout.
 * - Full schema mirror, including the monetization tables (`subscriptions`,
 *   `credit_transactions`) and `outreach_logs`.
 * - Upsert priority: primary-key id lookup first, then the table's secondary
 *   unique key (`applications(job_id,candidate_id)`, `users(email)`,
 *   `session_candidates(session_id,candidate_id)`, `subscriptions(user_id)`).
 * - JSON columns round-trip as objects/arrays.
 * - `reset_user_workspace` deletes in the fallback's cascade order.
 * - `match_resume_chunks` computes cosine similarity in-process.
 */

export type SqliteValue = string | number | bigint | null | Uint8Array;
export type SqliteRow = Record<string, unknown>;
export type SqliteParams = readonly SqliteValue[];

/** Paths already initialised in this process (mirrors `_INITIALIZED_DBS`). */
const INITIALIZED_DBS = new Set<string>();

/** Table → JSON-encoded columns. */
const JSON_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  jobs: ['jd_structured'],
  candidates: ['metadata'],
  applications: ['match_reasoning'],
  interviews: ['feedback'],
  chat_sessions: ['pending_confirmation'],
  chat_messages: ['metadata'],
  resume_chunks: ['embedding'],
  users: ['preferences'],
};

const DEFAULT_PREFERENCES =
  '{"email_alerts":true,"theme":"system","blind_mode_default":false,"auto_rubric":true}';

const DELETE_ORDER = [
  'chat_messages',
  'interviews',
  'applications',
  'resume_chunks',
  'candidates',
  'chat_sessions',
  'jobs',
] as const;

/** Open a SQLite connection with the Python pragmas applied. */
export function getSqliteConnection(dbPath: string): DatabaseSync {
  const conn = new DatabaseSync(dbPath);
  try {
    conn.exec('PRAGMA journal_mode=WAL;');
    conn.exec('PRAGMA synchronous=NORMAL;');
    conn.exec('PRAGMA foreign_keys=ON;');
    conn.exec('PRAGMA busy_timeout=30000;');
  } catch {
    // Pragmas are best-effort in Python too; keep the connection usable.
  }
  return conn;
}

function asParams(values: readonly unknown[]): SqliteValue[] {
  return values.map((value) => {
    if (value === undefined) {
      return null;
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'bigint' ||
      value === null ||
      value instanceof Uint8Array
    ) {
      return value;
    }
    return value instanceof Date ? value.toISOString() : String(value);
  });
}

function deserializeJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/** Deserialize one row for a table. */
export function deserializeRow(table: string, row: SqliteRow): SqliteRow {
  const result: SqliteRow = { ...row };
  for (const column of JSON_COLUMNS[table] ?? []) {
    if (result[column] !== null && result[column] !== undefined) {
      result[column] = deserializeJson(result[column]);
    }
  }
  if (table === 'resume_chunks' && !('candidate_name' in result)) {
    result.candidate_name = '';
  }
  return result;
}

/** Serialize JSON/Date values before binding them to SQLite. */
export function serializeRow(table: string, row: SqliteRow): SqliteRow {
  const result: SqliteRow = { ...row };
  for (const column of JSON_COLUMNS[table] ?? []) {
    const value = result[column];
    if (value !== undefined && value !== null) {
      result[column] = typeof value === 'string' ? value : JSON.stringify(value);
    }
  }
  return result;
}

interface QueryResponse {
  readonly data: SqliteRow[];
}

interface RpcResponse {
  readonly data: unknown;
}

/** Chainable table query builder (PostgREST subset used by the backend). */
export class TableBuilder {
  private queryType: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | undefined;
  private selectColumns = '*';
  private insertData: SqliteRow | SqliteRow[] | undefined;
  private updateData: SqliteRow | undefined;
  private upsertData: SqliteRow | SqliteRow[] | undefined;
  private onConflict: string | undefined;
  private readonly eqFilters: Array<[string, unknown]> = [];
  private readonly neqFilters: Array<[string, unknown]> = [];
  private orderBy: string | undefined;
  private orderDesc = false;
  private limitValue: number | undefined;

  constructor(
    private readonly tableName: string,
    private readonly conn: DatabaseSync,
  ) {}

  select(columns = '*'): this {
    this.queryType = 'select';
    this.selectColumns = columns;
    return this;
  }

  insert(data: SqliteRow | SqliteRow[]): this {
    this.queryType = 'insert';
    this.insertData = data;
    return this;
  }

  update(data: SqliteRow): this {
    this.queryType = 'update';
    this.updateData = data;
    return this;
  }

  upsert(data: SqliteRow | SqliteRow[], onConflict?: string): this {
    this.queryType = 'upsert';
    this.upsertData = data;
    this.onConflict = onConflict;
    return this;
  }

  delete(): this {
    this.queryType = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.eqFilters.push([column, value]);
    return this;
  }

  neq(column: string, value: unknown): this {
    this.neqFilters.push([column, value]);
    return this;
  }

  order(column: string, desc = false): this {
    this.orderBy = column;
    this.orderDesc = desc;
    return this;
  }

  limit(value: number): this {
    this.limitValue = value;
    return this;
  }

  private whereClause(): { sql: string; params: SqliteValue[] } {
    const clauses: string[] = [];
    const params: SqliteValue[] = [];
    for (const [column, value] of this.eqFilters) {
      clauses.push(`${column} = ?`);
      params.push(...asParams([value]));
    }
    for (const [column, value] of this.neqFilters) {
      clauses.push(`${column} != ?`);
      params.push(...asParams([value]));
    }
    return {
      sql: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
      params,
    };
  }

  private fetchById(id: unknown): SqliteRow | undefined {
    const row = this.conn
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .get(...asParams([id]));
    return row ? deserializeRow(this.tableName, row) : undefined;
  }

  private findExistingUpsertId(row: SqliteRow): string | undefined {
    const id = row.id;
    if (typeof id === 'string' && id.length > 0) {
      const found = this.conn.prepare(`SELECT id FROM ${this.tableName} WHERE id = ?`).get(id);
      if (found) {
        return String(found.id);
      }
    }

    // Explicit `on_conflict="a,b"` wins over the table defaults.
    const secondaryKeys: string[][] = [];
    if (this.onConflict) {
      secondaryKeys.push(
        this.onConflict
          .split(',')
          .map((column) => column.trim())
          .filter(Boolean),
      );
    }
    // Secondary unique keys, in the same order as the Python fallback.
    const lookups: Array<{ table: string; columns: string[] }> = [
      { table: 'applications', columns: ['job_id', 'candidate_id'] },
      { table: 'users', columns: ['email'] },
      { table: 'subscriptions', columns: ['user_id'] },
    ];
    for (const lookup of lookups) {
      if (lookup.table === this.tableName) {
        secondaryKeys.push(lookup.columns);
      }
    }

    for (const columns of secondaryKeys) {
      if (
        columns.length > 0 &&
        columns.every((column) => row[column] !== undefined && row[column] !== null)
      ) {
        const where = columns.map((column) => `${column} = ?`).join(' AND ');
        const values = asParams(columns.map((column) => row[column]));
        const found = this.conn
          .prepare(`SELECT id FROM ${this.tableName} WHERE ${where}`)
          .get(...values);
        if (found) {
          return String(found.id);
        }
      }
    }
    return undefined;
  }

  execute(): QueryResponse {
    switch (this.queryType) {
      case 'select':
        return { data: this.executeSelect() };
      case 'insert':
        return { data: this.executeInsert() };
      case 'update':
        return { data: this.executeUpdate() };
      case 'delete':
        return { data: this.executeDelete() };
      case 'upsert':
        return { data: this.executeUpsert() };
      default:
        return { data: [] };
    }
  }

  private executeSelect(): SqliteRow[] {
    const embedded = new Map<string, string[]>();
    let columns = this.selectColumns;

    if (columns !== '*') {
      const tokens = columns.match(/\w+\([^)]+\)|\w+/g) ?? [];
      const clean: string[] = [];
      for (const token of tokens) {
        const relation = token.match(/^(\w+)\(([^)]+)\)$/);
        if (relation?.[1] && relation[2]) {
          embedded.set(
            relation[1],
            relation[2]
              .split(',')
              .map((field) => field.trim())
              .filter(Boolean),
          );
        } else {
          clean.push(token.trim());
        }
      }
      if (embedded.has('candidates') && !clean.includes('candidate_id')) {
        clean.push('candidate_id');
      }
      columns = clean.length > 0 ? clean.join(', ') : '*';
    }

    const where = this.whereClause();
    let query = `SELECT ${columns} FROM ${this.tableName}${where.sql}`;
    if (this.orderBy) {
      query += ` ORDER BY ${this.orderBy} ${this.orderDesc ? 'DESC' : 'ASC'}`;
    }
    if (this.limitValue !== undefined) {
      query += ` LIMIT ${this.limitValue}`;
    }

    const rows = this.conn.prepare(query).all(...where.params) as SqliteRow[];
    const results = rows.map((row) => deserializeRow(this.tableName, row));

    const candidateFields = embedded.get('candidates');
    if (candidateFields) {
      for (const result of results) {
        const candidateId = result.candidate_id;
        const candidate =
          typeof candidateId === 'string'
            ? this.conn.prepare('SELECT * FROM candidates WHERE id = ?').get(candidateId)
            : undefined;
        if (candidate) {
          const deserialized = deserializeRow('candidates', candidate);
          result.candidates = Object.fromEntries(
            candidateFields.map((field) => [field, deserialized[field]]),
          );
        } else {
          result.candidates = {};
        }
      }
    }

    return results;
  }

  private executeInsert(): SqliteRow[] {
    const rows = Array.isArray(this.insertData) ? this.insertData : [this.insertData ?? {}];
    const inserted: SqliteRow[] = [];
    for (const source of rows) {
      const row = serializeRow(this.tableName, source);
      // session_candidates is keyed by its two foreign keys, not an `id`.
      if (this.tableName !== 'session_candidates' && row.id === undefined) {
        row.id = randomUUID();
      }
      const columns = Object.keys(row);
      const placeholders = columns.map(() => '?').join(', ');
      this.conn
        .prepare(`INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`)
        .run(...asParams(columns.map((column) => row[column])));
      if (row.id === undefined) {
        inserted.push(deserializeRow(this.tableName, row));
        continue;
      }
      const fetched = this.fetchById(row.id);
      inserted.push(fetched ?? deserializeRow(this.tableName, row));
    }
    return inserted;
  }

  private executeUpdate(): SqliteRow[] {
    const row = serializeRow(this.tableName, this.updateData ?? {});
    const columns = Object.keys(row);
    const where = this.whereClause();
    if (columns.length > 0) {
      this.conn
        .prepare(
          `UPDATE ${this.tableName} SET ${columns.map((column) => `${column} = ?`).join(', ')}${where.sql}`,
        )
        .run(...asParams(columns.map((column) => row[column])), ...where.params);
    }
    const rows = this.conn
      .prepare(`SELECT * FROM ${this.tableName}${where.sql}`)
      .all(...where.params) as SqliteRow[];
    return rows.map((updated) => deserializeRow(this.tableName, updated));
  }

  private executeDelete(): SqliteRow[] {
    const where = this.whereClause();
    this.conn.prepare(`DELETE FROM ${this.tableName}${where.sql}`).run(...where.params);
    return [];
  }

  private executeUpsert(): SqliteRow[] {
    const rows = Array.isArray(this.upsertData) ? this.upsertData : [this.upsertData ?? {}];
    const upserted: SqliteRow[] = [];

    for (const source of rows) {
      const row = serializeRow(this.tableName, source);

      // session_candidates has no `id`: handle its composite key first.
      if (this.tableName === 'session_candidates') {
        const sessionId = row.session_id;
        const candidateId = row.candidate_id;
        const existing = this.conn
          .prepare(
            'SELECT session_id, candidate_id FROM session_candidates WHERE session_id = ? AND candidate_id = ?',
          )
          .get(...asParams([sessionId, candidateId]));
        if (existing) {
          upserted.push({ ...existing });
        } else {
          this.conn
            .prepare(
              'INSERT OR IGNORE INTO session_candidates (session_id, candidate_id) VALUES (?, ?)',
            )
            .run(...asParams([sessionId, candidateId]));
          upserted.push({ session_id: sessionId, candidate_id: candidateId });
        }
        continue;
      }

      const existingId = this.findExistingUpsertId(row);
      if (existingId !== undefined) {
        row.id = existingId;
        const columns = Object.keys(row).filter((column) => column !== 'id');
        if (columns.length > 0) {
          this.conn
            .prepare(
              `UPDATE ${this.tableName} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
            )
            .run(...asParams(columns.map((column) => row[column])), existingId);
        }
        const fetched = this.fetchById(existingId);
        if (fetched) {
          upserted.push(fetched);
        }
        continue;
      }

      if (row.id === undefined) {
        row.id = randomUUID();
      }
      const columns = Object.keys(row);
      const placeholders = columns.map(() => '?').join(', ');
      this.conn
        .prepare(`INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`)
        .run(...asParams(columns.map((column) => row[column])));
      const fetched = this.fetchById(row.id);
      if (fetched) {
        upserted.push(fetched);
      }
    }

    return upserted;
  }
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftMagnitude += a * a;
    rightMagnitude += b * b;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

/** RPC subset supported by the fallback. */
export class RpcBuilder {
  constructor(
    private readonly functionName: string,
    private readonly params: Record<string, unknown>,
    private readonly conn: DatabaseSync,
  ) {}

  execute(): RpcResponse {
    if (this.functionName === 'reset_user_workspace') {
      return this.resetUserWorkspace();
    }
    if (this.functionName === 'match_resume_chunks') {
      return this.matchResumeChunks();
    }
    throw new Error(`Unsupported SQLite fallback RPC: ${this.functionName}`);
  }

  private resetUserWorkspace(): RpcResponse {
    const targetUserId = this.params.target_user_id;
    this.conn.exec('BEGIN IMMEDIATE;');
    try {
      this.conn
        .prepare(
          `DELETE FROM session_candidates
             WHERE session_id IN (SELECT id FROM chat_sessions WHERE user_id = ?)
                OR candidate_id IN (SELECT id FROM candidates WHERE user_id = ?)`,
        )
        .run(...asParams([targetUserId, targetUserId]));
      for (const table of DELETE_ORDER) {
        this.conn
          .prepare(`DELETE FROM ${table} WHERE user_id = ?`)
          .run(...asParams([targetUserId]));
      }
      this.conn.exec('COMMIT;');
    } catch (error) {
      this.conn.exec('ROLLBACK;');
      throw error;
    }
    return { data: { success: true } };
  }

  private matchResumeChunks(): RpcResponse {
    const queryEmbedding = (this.params.query_embedding as number[] | undefined) ?? [];
    const threshold = Number(this.params.match_threshold ?? 0);
    const matchCount = Number(this.params.match_count ?? 3);
    const candidateId = this.params.filter_candidate_id;
    const userId = this.params.filter_user_id;

    let query = `SELECT rc.id, rc.candidate_id, c.full_name, rc.chunk_text, rc.embedding
      FROM resume_chunks rc
      LEFT JOIN candidates c ON c.id = rc.candidate_id
      WHERE 1 = 1`;
    const params: unknown[] = [];
    if (candidateId) {
      query += ' AND rc.candidate_id = ?';
      params.push(candidateId);
    }
    if (userId) {
      query += ' AND rc.user_id = ?';
      params.push(userId);
    }

    const rows = this.conn.prepare(query).all(...asParams(params)) as SqliteRow[];
    const matches: Array<Record<string, unknown> & { similarity: number }> = [];
    for (const row of rows) {
      if (!row.embedding) {
        continue;
      }
      try {
        const embedding = JSON.parse(String(row.embedding)) as number[];
        const similarity = cosineSimilarity(queryEmbedding, embedding);
        if (similarity >= threshold) {
          const fullName = typeof row.full_name === 'string' ? row.full_name : 'Candidate';
          matches.push({
            id: row.id,
            candidate_id: row.candidate_id,
            candidate_name: fullName,
            full_name: fullName,
            chunk_text: row.chunk_text,
            similarity,
          });
        }
      } catch {
        // Skip malformed embeddings, matching the Python fallback.
      }
    }

    matches.sort((left, right) => right.similarity - left.similarity);
    return { data: matches.slice(0, matchCount) };
  }
}

/** Drop-in local database used when Supabase is unavailable outside production. */
export class FallbackDatabase {
  readonly dbPath: string;
  private readonly conn: DatabaseSync;

  constructor(dbPath: string = getConfig().database.fallbackPath, config: AppConfig = getConfig()) {
    if (config.isProduction) {
      throw new DatabaseUnavailableError(SQLITE_FALLBACK_PROHIBITED);
    }
    this.dbPath = dbPath;
    this.conn = getSqliteConnection(dbPath);
    if (dbPath === ':memory:' || !INITIALIZED_DBS.has(dbPath)) {
      this.initialize();
      INITIALIZED_DBS.add(dbPath);
    }
  }

  table(name: string): TableBuilder {
    return new TableBuilder(name, this.conn);
  }

  rpc(name: string, params: Record<string, unknown> = {}): RpcBuilder {
    return new RpcBuilder(name, params, this.conn);
  }

  close(): void {
    this.conn.close();
  }

  private initialize(): void {
    const conn = this.conn;
    conn.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT,
        avatar_url TEXT,
        phone TEXT,
        company_name TEXT,
        company_website TEXT,
        role TEXT NOT NULL DEFAULT 'recruiter',
        preferences TEXT DEFAULT '${DEFAULT_PREFERENCES}',
        last_sign_in_at TIMESTAMP,
        credits_balance INTEGER NOT NULL DEFAULT 10,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      INSERT OR IGNORE INTO users (id, email, full_name, role)
        VALUES ('local_dev_user_123', 'recruiter@recruitai.local', 'Lead Recruiter', 'recruiter');
      UPDATE users SET preferences = '${DEFAULT_PREFERENCES}'
        WHERE id = 'local_dev_user_123'
          AND (preferences LIKE '%"blind_mode_default": true%'
            OR preferences LIKE '%"blind_mode_default":true%');

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT 'local_dev_user_123',
        title TEXT NOT NULL,
        raw_jd TEXT,
        jd_structured TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS candidates (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT 'local_dev_user_123',
        full_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        resume_file_url TEXT,
        raw_resume_text TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS resume_chunks (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT 'local_dev_user_123',
        chunk_text TEXT NOT NULL,
        chunk_index INTEGER DEFAULT 0,
        embedding TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        candidate_id TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT 'local_dev_user_123',
        match_score REAL,
        match_reasoning TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS interviews (
        id TEXT PRIMARY KEY,
        application_id TEXT,
        candidate_id TEXT,
        user_id TEXT NOT NULL DEFAULT 'local_dev_user_123',
        scheduled_at TIMESTAMP,
        duration_minutes INTEGER DEFAULT 30,
        mode TEXT DEFAULT 'video',
        meeting_link TEXT,
        status TEXT NOT NULL DEFAULT 'scheduled',
        feedback TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT 'local_dev_user_123',
        job_id TEXT,
        title TEXT NOT NULL DEFAULT 'New Hiring Campaign',
        last_intent TEXT,
        pending_confirmation TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT 'local_dev_user_123',
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS session_candidates (
        session_id TEXT NOT NULL,
        candidate_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (session_id, candidate_id)
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        razorpay_order_id TEXT,
        razorpay_payment_id TEXT,
        razorpay_subscription_id TEXT,
        current_period_start TIMESTAMP,
        current_period_end TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);

      CREATE TABLE IF NOT EXISTS credit_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        reason TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);

      CREATE TABLE IF NOT EXISTS outreach_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        candidate_id TEXT,
        recipient_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        template_id TEXT,
        status TEXT NOT NULL DEFAULT 'sent',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_outreach_logs_user_id ON outreach_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_outreach_logs_candidate_id ON outreach_logs(candidate_id);
      CREATE INDEX IF NOT EXISTS idx_outreach_logs_created_at ON outreach_logs(created_at DESC);
    `);

    // Forward-compatible columns for databases created by older versions.
    const ensureColumn = (table: string, column: string, type: string): void => {
      try {
        const existing = conn.prepare(`PRAGMA table_info(${table})`).all() as SqliteRow[];
        if (!existing.some((row) => row.name === column)) {
          conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        }
      } catch {
        // Best effort, matching Python.
      }
    };

    ensureColumn('jobs', 'user_id', "TEXT NOT NULL DEFAULT 'local_dev_user_123'");
    ensureColumn('candidates', 'user_id', "TEXT NOT NULL DEFAULT 'local_dev_user_123'");
    ensureColumn('resume_chunks', 'user_id', "TEXT NOT NULL DEFAULT 'local_dev_user_123'");
    ensureColumn('resume_chunks', 'candidate_name', 'TEXT');
    ensureColumn('resume_chunks', 'chunk_index', 'INTEGER DEFAULT 0');
    ensureColumn('applications', 'user_id', "TEXT NOT NULL DEFAULT 'local_dev_user_123'");
    ensureColumn('interviews', 'user_id', "TEXT NOT NULL DEFAULT 'local_dev_user_123'");
    ensureColumn('chat_sessions', 'user_id', "TEXT NOT NULL DEFAULT 'local_dev_user_123'");
    ensureColumn('chat_sessions', 'job_id', 'TEXT');
    ensureColumn('chat_sessions', 'updated_at', 'TIMESTAMP');
    ensureColumn('users', 'credits_balance', 'INTEGER NOT NULL DEFAULT 10');
    conn.exec('UPDATE users SET credits_balance = 10 WHERE credits_balance IS NULL');
    ensureColumn('chat_messages', 'user_id', "TEXT NOT NULL DEFAULT 'local_dev_user_123'");

    // BUG-4: rebuild legacy interviews that still require scheduled_at.
    try {
      const columns = conn.prepare('PRAGMA table_info(interviews)').all() as SqliteRow[];
      const scheduledAt = columns.find((column) => column.name === 'scheduled_at');
      if (scheduledAt && Number(scheduledAt.notnull) === 1) {
        conn.exec(`
          ALTER TABLE interviews RENAME TO _interviews_old;
          CREATE TABLE interviews (
            id TEXT PRIMARY KEY,
            application_id TEXT,
            candidate_id TEXT,
            user_id TEXT NOT NULL DEFAULT 'local_dev_user_123',
            scheduled_at TIMESTAMP,
            duration_minutes INTEGER DEFAULT 30,
            mode TEXT DEFAULT 'video',
            meeting_link TEXT,
            status TEXT NOT NULL DEFAULT 'scheduled',
            feedback TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO interviews (id, application_id, candidate_id, user_id, scheduled_at,
            duration_minutes, mode, meeting_link, status, feedback, created_at, updated_at)
          SELECT id, application_id, candidate_id, user_id, scheduled_at,
            duration_minutes, mode, meeting_link, status, feedback, created_at, updated_at
          FROM _interviews_old;
          DROP TABLE _interviews_old;
        `);
      }
    } catch {
      // Legacy databases without an interviews table need no migration.
    }
  }
}

let cached: FallbackDatabase | undefined;

/** Process-wide fallback handle; tests can pass a path to `createFallbackDatabase`. */
export function getFallbackDatabase(): FallbackDatabase {
  cached ??= new FallbackDatabase();
  return cached;
}

/** Create an independent fallback handle (used by tests and CLI tools). */
export function createFallbackDatabase(
  dbPath?: string,
  config: AppConfig = getConfig(),
): FallbackDatabase {
  return new FallbackDatabase(dbPath, config);
}

/** Close the cached fallback handle. */
export function closeFallbackDatabase(): void {
  cached?.close();
  cached = undefined;
}

/** Test helper: forget the singleton without closing it. */
export function resetFallbackDatabaseForTests(): void {
  cached = undefined;
}

/** Re-export so callers can format pgvector values consistently. */
export { toVectorLiteral };
