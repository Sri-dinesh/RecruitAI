import { and, desc, eq } from 'drizzle-orm';

import { getConfig, type AppConfig } from '../config/index.js';
import { getDb, type Database } from './client.js';
import { getFallbackDatabase, type FallbackDatabase } from './fallback.js';
import { outreachLogs } from './schema.js';

/**
 * Narrow data-access contract used by `services/email-service.ts`.
 *
 * Ports the Supabase `outreach_logs` reads/writes from `routes_email.py` while
 * keeping every query tenant-scoped by `user_id`. The Drizzle/PostgreSQL and
 * SQLite implementations preserve the same table and fields.
 */

export type OutreachTimestamp = Date | string;

export interface OutreachLogInsert {
  readonly id: string;
  readonly userId: string;
  readonly candidateId: string | null;
  readonly recipientEmail: string;
  readonly subject: string;
  readonly body: string;
  readonly templateId: string | null;
  readonly status: string;
  readonly errorMessage: string | null;
  readonly createdAt: OutreachTimestamp;
}

export type OutreachLogRecord = OutreachLogInsert;

export interface OutreachStore {
  insertLog(record: OutreachLogInsert): Promise<void>;
  /** Newest-first history, optionally scoped to one candidate. */
  listLogs(userId: string, candidateId: string | null, limit: number): Promise<OutreachLogRecord[]>;
  /** All statuses for the tenant, used by `/api/email/stats`. */
  listStatuses(userId: string): Promise<string[]>;
}

function drizzleLog(row: {
  id: string;
  userId: string;
  candidateId: string | null;
  recipientEmail: string;
  subject: string;
  body: string;
  templateId: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
}): OutreachLogRecord {
  return {
    id: row.id,
    userId: row.userId,
    candidateId: row.candidateId,
    recipientEmail: row.recipientEmail,
    subject: row.subject,
    body: row.body,
    templateId: row.templateId,
    status: row.status,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
  };
}

/** Primary path: Drizzle queries against PostgreSQL. */
export function createDrizzleOutreachStore(db: Database): OutreachStore {
  return {
    async insertLog(record) {
      await db.insert(outreachLogs).values({
        id: record.id,
        userId: record.userId,
        candidateId: record.candidateId,
        recipientEmail: record.recipientEmail,
        subject: record.subject,
        body: record.body,
        templateId: record.templateId,
        status: record.status,
        errorMessage: record.errorMessage,
        createdAt: record.createdAt instanceof Date ? record.createdAt : new Date(record.createdAt),
      });
    },

    async listLogs(userId, candidateId, limit) {
      const condition =
        candidateId === null
          ? eq(outreachLogs.userId, userId)
          : and(eq(outreachLogs.userId, userId), eq(outreachLogs.candidateId, candidateId));

      const rows = await db
        .select()
        .from(outreachLogs)
        .where(condition)
        .orderBy(desc(outreachLogs.createdAt))
        .limit(limit);
      return rows.map(drizzleLog);
    },

    async listStatuses(userId) {
      const rows = await db
        .select({ status: outreachLogs.status })
        .from(outreachLogs)
        .where(eq(outreachLogs.userId, userId));
      return rows.map((row) => row.status);
    },
  };
}

/** Fallback path: the same contract over the local SQLite database. */
export function createSqliteOutreachStore(db: FallbackDatabase): OutreachStore {
  return {
    async insertLog(record) {
      db.table('outreach_logs')
        .insert({
          id: record.id,
          user_id: record.userId,
          candidate_id: record.candidateId,
          recipient_email: record.recipientEmail,
          subject: record.subject,
          body: record.body,
          template_id: record.templateId,
          status: record.status,
          error_message: record.errorMessage,
          created_at:
            record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
        })
        .execute();
    },

    async listLogs(userId, candidateId, limit) {
      const query = db.table('outreach_logs').select().eq('user_id', userId);
      if (candidateId !== null) {
        query.eq('candidate_id', candidateId);
      }
      return query
        .order('created_at', true)
        .limit(limit)
        .execute()
        .data.map((row) => ({
          id: String(row.id),
          userId: String(row.user_id),
          candidateId: (row.candidate_id as string | null | undefined) ?? null,
          recipientEmail: String(row.recipient_email),
          subject: String(row.subject),
          body: String(row.body),
          templateId: (row.template_id as string | null | undefined) ?? null,
          status: String(row.status),
          errorMessage: (row.error_message as string | null | undefined) ?? null,
          createdAt: (row.created_at as string | null | undefined) ?? '',
        }));
    },

    async listStatuses(userId) {
      return db
        .table('outreach_logs')
        .select('status')
        .eq('user_id', userId)
        .execute()
        .data.map((row) => String(row.status));
    },
  };
}

export interface OutreachStoreOptions {
  readonly config?: AppConfig;
  /** Explicit Drizzle handle (tests / scripts). */
  readonly db?: Database;
  /** Explicit SQLite fallback handle (tests). */
  readonly fallback?: FallbackDatabase;
}

/** Resolve the production store; lazy so route construction opens no database. */
export function createOutreachStore(options: OutreachStoreOptions = {}): OutreachStore {
  if (options.db) {
    return createDrizzleOutreachStore(options.db);
  }
  if (options.fallback) {
    return createSqliteOutreachStore(options.fallback);
  }
  const config = options.config ?? getConfig();
  return config.database.url
    ? createDrizzleOutreachStore(getDb())
    : createSqliteOutreachStore(getFallbackDatabase());
}
