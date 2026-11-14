import { randomUUID } from 'node:crypto';

import { desc, eq } from 'drizzle-orm';

import { getConfig, type AppConfig } from '../config/index.js';
import { getDb, type Database } from './client.js';
import { getFallbackDatabase, type FallbackDatabase } from './fallback.js';
import { creditTransactions, subscriptions, users } from './schema.js';

/**
 * Narrow data-access contract used by `services/payment-service.ts`.
 *
 * The Python payment service talks to Supabase directly. Keeping every query
 * behind this store gives the same behavior on the primary Drizzle/PostgreSQL
 * path and the SQLite fallback, with one place per table that knows how rows
 * are written.
 *
 * Two deliberate porting notes:
 *
 * - Python writes `sub_…`/`tx_…` string ids, while the PostgreSQL schema
 *   declares UUID primary keys. The Drizzle implementation therefore maps a
 *   non-UUID id to a generated UUID; the public `subscription_id` returned by
 *   `/verify` keeps the original `sub_…` value. (Python's Supabase upsert would
 *   fail on those ids, so this preserves the API contract while making the
 *   audit rows durable.)
 * - Subscriptions are consolidated to one row per user, matching the SQLite
 *   fallback's `subscriptions(user_id)` upsert priority and the "latest
 *   subscription" lookup.
 */

/** Database timestamps arrive as `Date` (Drizzle) or ISO text (SQLite). */
export type TimestampValue = Date | string | null;

export interface SubscriptionUpsert {
  readonly id: string;
  readonly userId: string;
  readonly planId: string;
  readonly status: string;
  readonly razorpayOrderId: string | null;
  readonly razorpayPaymentId: string | null;
  readonly razorpaySubscriptionId?: string | null;
  readonly currentPeriodStart: TimestampValue;
  readonly currentPeriodEnd: TimestampValue;
  readonly createdAt: TimestampValue;
}

export type SubscriptionRecord = SubscriptionUpsert;

export interface CreditTransactionInsert {
  readonly id: string;
  readonly userId: string;
  readonly amount: number;
  readonly balanceAfter: number;
  readonly reason: string;
  readonly createdAt: TimestampValue;
}

export type CreditTransactionRecord = CreditTransactionInsert;

export interface UserInsert {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly role: string;
  readonly creditsBalance: number;
}

export interface PaymentStore {
  /** Current credit balance, or `undefined` when the user row is missing. */
  getCreditsBalance(userId: string): Promise<number | undefined>;
  /** Most recently created subscription for the tenant. */
  getLatestSubscription(userId: string): Promise<SubscriptionRecord | undefined>;
  /** Insert or replace the tenant's subscription row. */
  saveSubscription(record: SubscriptionUpsert): Promise<void>;
  userExists(userId: string): Promise<boolean>;
  updateCreditsBalance(userId: string, balance: number): Promise<void>;
  insertUser(record: UserInsert): Promise<void>;
  insertCreditTransaction(record: CreditTransactionInsert): Promise<void>;
  listCreditTransactions(userId: string, limit: number): Promise<CreditTransactionRecord[]>;
  cancelSubscriptions(userId: string): Promise<void>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PostgreSQL `uuid` columns cannot store the public `sub_…`/`tx_…` ids. */
function uuidOrGenerated(id: string): string {
  return UUID_PATTERN.test(id) ? id : randomUUID();
}

function asDate(value: TimestampValue): Date | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}

function toIso(value: TimestampValue): string | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function drizzleSubscription(row: {
  id: string;
  userId: string;
  planId: string;
  status: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  razorpaySubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  createdAt: Date;
}): SubscriptionRecord {
  return {
    id: row.id,
    userId: row.userId,
    planId: row.planId,
    status: row.status,
    razorpayOrderId: row.razorpayOrderId,
    razorpayPaymentId: row.razorpayPaymentId,
    razorpaySubscriptionId: row.razorpaySubscriptionId,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    createdAt: row.createdAt,
  };
}

/** Primary path: Drizzle queries against PostgreSQL. */
export function createDrizzlePaymentStore(db: Database): PaymentStore {
  return {
    async getCreditsBalance(userId) {
      const rows = await db
        .select({ creditsBalance: users.creditsBalance })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const value = rows[0]?.creditsBalance;
      return value === undefined || value === null ? undefined : Number(value);
    },

    async getLatestSubscription(userId) {
      const rows = await db
        .select({
          id: subscriptions.id,
          userId: subscriptions.userId,
          planId: subscriptions.planId,
          status: subscriptions.status,
          razorpayOrderId: subscriptions.razorpayOrderId,
          razorpayPaymentId: subscriptions.razorpayPaymentId,
          razorpaySubscriptionId: subscriptions.razorpaySubscriptionId,
          currentPeriodStart: subscriptions.currentPeriodStart,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          createdAt: subscriptions.createdAt,
        })
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      return rows[0] ? drizzleSubscription(rows[0]) : undefined;
    },

    async saveSubscription(record) {
      const existing = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.userId, record.userId))
        .limit(1);

      const values = {
        planId: record.planId,
        status: record.status,
        razorpayOrderId: record.razorpayOrderId,
        razorpayPaymentId: record.razorpayPaymentId,
        razorpaySubscriptionId: record.razorpaySubscriptionId ?? null,
        currentPeriodStart: asDate(record.currentPeriodStart),
        currentPeriodEnd: asDate(record.currentPeriodEnd),
        updatedAt: new Date(),
      };

      if (existing[0]) {
        await db.update(subscriptions).set(values).where(eq(subscriptions.id, existing[0].id));
        return;
      }

      await db.insert(subscriptions).values({
        id: uuidOrGenerated(record.id),
        userId: record.userId,
        ...values,
        createdAt: asDate(record.createdAt) ?? new Date(),
      });
    },

    async userExists(userId) {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return rows.length > 0;
    },

    async updateCreditsBalance(userId, balance) {
      await db.update(users).set({ creditsBalance: balance }).where(eq(users.id, userId));
    },

    async insertUser(record) {
      await db.insert(users).values({
        id: record.id,
        email: record.email,
        fullName: record.fullName,
        role: record.role,
        creditsBalance: record.creditsBalance,
      });
    },

    async insertCreditTransaction(record) {
      await db.insert(creditTransactions).values({
        id: uuidOrGenerated(record.id),
        userId: record.userId,
        amount: record.amount,
        balanceAfter: record.balanceAfter,
        reason: record.reason,
        createdAt: asDate(record.createdAt) ?? new Date(),
      });
    },

    async listCreditTransactions(userId, limit) {
      const rows = await db
        .select({
          id: creditTransactions.id,
          userId: creditTransactions.userId,
          amount: creditTransactions.amount,
          balanceAfter: creditTransactions.balanceAfter,
          reason: creditTransactions.reason,
          createdAt: creditTransactions.createdAt,
        })
        .from(creditTransactions)
        .where(eq(creditTransactions.userId, userId))
        .orderBy(desc(creditTransactions.createdAt))
        .limit(limit);
      return rows;
    },

    async cancelSubscriptions(userId) {
      await db
        .update(subscriptions)
        .set({ status: 'canceled', updatedAt: new Date() })
        .where(eq(subscriptions.userId, userId));
    },
  };
}

/** Fallback path: the same contract over the local SQLite database. */
export function createSqlitePaymentStore(db: FallbackDatabase): PaymentStore {
  return {
    async getCreditsBalance(userId) {
      const rows = db
        .table('users')
        .select('credits_balance')
        .eq('id', userId)
        .limit(1)
        .execute().data;
      const value = rows[0]?.credits_balance;
      return value === undefined || value === null ? undefined : Number(value);
    },

    async getLatestSubscription(userId) {
      const rows = db
        .table('subscriptions')
        .select()
        .eq('user_id', userId)
        .order('created_at', true)
        .limit(1)
        .execute().data;
      const row = rows[0];
      if (!row) {
        return undefined;
      }
      return {
        id: String(row.id),
        userId: String(row.user_id),
        planId: String(row.plan_id),
        status: String(row.status),
        razorpayOrderId: (row.razorpay_order_id as string | null | undefined) ?? null,
        razorpayPaymentId: (row.razorpay_payment_id as string | null | undefined) ?? null,
        razorpaySubscriptionId: (row.razorpay_subscription_id as string | null | undefined) ?? null,
        currentPeriodStart: (row.current_period_start as string | null | undefined) ?? null,
        currentPeriodEnd: (row.current_period_end as string | null | undefined) ?? null,
        createdAt: (row.created_at as string | null | undefined) ?? null,
      };
    },

    async saveSubscription(record) {
      const existing = db
        .table('subscriptions')
        .select('id')
        .eq('user_id', record.userId)
        .limit(1)
        .execute().data[0];

      const values = {
        plan_id: record.planId,
        status: record.status,
        razorpay_order_id: record.razorpayOrderId,
        razorpay_payment_id: record.razorpayPaymentId,
        razorpay_subscription_id: record.razorpaySubscriptionId ?? null,
        current_period_start: toIso(record.currentPeriodStart),
        current_period_end: toIso(record.currentPeriodEnd),
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        db.table('subscriptions').update(values).eq('id', String(existing.id)).execute();
        return;
      }

      db.table('subscriptions')
        .insert({
          id: record.id,
          user_id: record.userId,
          ...values,
          created_at: toIso(record.createdAt) ?? new Date().toISOString(),
        })
        .execute();
    },

    async userExists(userId) {
      return db.table('users').select('id').eq('id', userId).limit(1).execute().data.length > 0;
    },

    async updateCreditsBalance(userId, balance) {
      db.table('users')
        .update({ credits_balance: balance, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .execute();
    },

    async insertUser(record) {
      db.table('users')
        .insert({
          id: record.id,
          email: record.email,
          full_name: record.fullName,
          role: record.role,
          credits_balance: record.creditsBalance,
        })
        .execute();
    },

    async insertCreditTransaction(record) {
      db.table('credit_transactions')
        .insert({
          id: record.id,
          user_id: record.userId,
          amount: record.amount,
          balance_after: record.balanceAfter,
          reason: record.reason,
          created_at: toIso(record.createdAt) ?? new Date().toISOString(),
        })
        .execute();
    },

    async listCreditTransactions(userId, limit) {
      return db
        .table('credit_transactions')
        .select()
        .eq('user_id', userId)
        .order('created_at', true)
        .limit(limit)
        .execute()
        .data.map((row) => ({
          id: String(row.id),
          userId: String(row.user_id),
          amount: Number(row.amount),
          balanceAfter: Number(row.balance_after),
          reason: String(row.reason),
          createdAt: (row.created_at as string | null | undefined) ?? null,
        }));
    },

    async cancelSubscriptions(userId) {
      db.table('subscriptions')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .execute();
    },
  };
}

export interface PaymentStoreOptions {
  readonly config?: AppConfig;
  /** Explicit Drizzle handle (tests / scripts). */
  readonly db?: Database;
  /** Explicit SQLite fallback handle (tests). */
  readonly fallback?: FallbackDatabase;
}

/**
 * Resolve the production store: PostgreSQL when `DATABASE_URL` is configured,
 * otherwise the local SQLite fallback, mirroring the Python database choice.
 * Lazy by design, so constructing a payment service never opens a connection.
 */
export function createPaymentStore(options: PaymentStoreOptions = {}): PaymentStore {
  if (options.db) {
    return createDrizzlePaymentStore(options.db);
  }
  if (options.fallback) {
    return createSqlitePaymentStore(options.fallback);
  }
  const config = options.config ?? getConfig();
  return config.database.url
    ? createDrizzlePaymentStore(getDb())
    : createSqlitePaymentStore(getFallbackDatabase());
}
