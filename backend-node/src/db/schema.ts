import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Drizzle mapping of the PostgreSQL schema owned by `supabase/migrations/`.
 *
 * The SQL migrations are the single source of truth; this module is a
 * read-only, hand-maintained *introspection* of them. Column names, nullability,
 * defaults, enums and indexes intentionally mirror:
 *
 * - `backend/scripts/enhanced_schema.sql` (base tables + pgvector)
 * - `backend/scripts/01_users_schema.sql` (public.users)
 * - `supabase/migrations/20260916000000_enforce_rls_and_reset.sql`
 * - `supabase/migrations/20260916000001_session_candidates_table.sql`
 * - `supabase/migrations/20260916000002_interview_nullable_slot.sql`
 * - `supabase/migrations/20260917000000_production_migration.sql`
 * - `supabase/migrations/20261030000000_subscriptions_and_credits.sql`
 * - `supabase/migrations/20261107000000_outreach_logs.sql`
 *
 * Do not run Drizzle Kit against production: these definitions describe the
 * existing database, they do not drive it. `updated_at` triggers, RLS policies
 * and SECURITY DEFINER functions live in SQL and remain authoritative.
 *
 * `users.id` and `outreach_logs.user_id` reference `auth.users` in Postgres.
 * The `auth` schema belongs to Supabase Auth, so no Drizzle foreign key is
 * declared for it; the database constraint still enforces the relationship.
 */

/** 384-dimensional sentence-transformer embedding (`all-MiniLM-L6-v2`). */
const vector384 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(384)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value) as number[];
  },
});

const DEFAULT_USER_PREFERENCES = {
  email_alerts: true,
  theme: 'system',
  blind_mode_default: false,
  auto_rubric: true,
} as const;

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull().unique(),
    fullName: text('full_name'),
    avatarUrl: text('avatar_url'),
    phone: text('phone'),
    companyName: text('company_name'),
    companyWebsite: text('company_website'),
    role: text('role').notNull().default('recruiter'),
    preferences: jsonb('preferences')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(DEFAULT_USER_PREFERENCES),
    lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
    creditsBalance: integer('credits_balance').notNull().default(10),
    ...timestamps,
  },
  (table) => [
    index('idx_users_role').on(table.role),
    index('idx_users_created_at').on(table.createdAt),
    check('users_role_check', sql`${table.role} in ('recruiter', 'employer')`),
  ],
);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    title: text('title').notNull(),
    rawJd: text('raw_jd'),
    jdStructured: jsonb('jd_structured').$type<Record<string, unknown>>(),
    status: text('status').notNull().default('active'),
    ...timestamps,
  },
  (table) => [
    index('idx_jobs_user_id').on(table.userId),
    index('idx_jobs_status').on(table.status),
    check('jobs_status_check', sql`${table.status} in ('draft', 'active', 'closed', 'archived')`),
  ],
);

export const candidates = pgTable(
  'candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    fullName: text('full_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    resumeFileUrl: text('resume_file_url'),
    rawResumeText: text('raw_resume_text'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (table) => [
    index('idx_candidates_user_id').on(table.userId),
    index('idx_candidates_email').on(table.email),
    unique('candidates_user_id_email_key').on(table.userId, table.email),
  ],
);

export const resumeChunks = pgTable(
  'resume_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    candidateId: uuid('candidate_id').notNull(),
    userId: uuid('user_id').notNull(),
    chunkText: text('chunk_text').notNull(),
    chunkIndex: integer('chunk_index').notNull().default(0),
    embedding: vector384('embedding'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_resume_chunks_candidate_id').on(table.candidateId),
    index('idx_resume_chunks_user_id').on(table.userId),
    index('idx_resume_chunks_embedding')
      .using('ivfflat', table.embedding.op('vector_cosine_ops'))
      .with({ lists: 100 }),
    foreignKey({
      name: 'resume_chunks_candidate_id_fkey',
      columns: [table.candidateId],
      foreignColumns: [candidates.id],
    }).onDelete('cascade'),
  ],
);

export const applications = pgTable(
  'applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id').notNull(),
    candidateId: uuid('candidate_id').notNull(),
    userId: uuid('user_id').notNull(),
    matchScore: numeric('match_score', { precision: 5, scale: 2, mode: 'number' }),
    matchReasoning: jsonb('match_reasoning').$type<Record<string, unknown>>(),
    status: text('status').notNull().default('new'),
    ...timestamps,
  },
  (table) => [
    index('idx_applications_job_id').on(table.jobId),
    index('idx_applications_candidate_id').on(table.candidateId),
    index('idx_applications_user_id').on(table.userId),
    index('idx_applications_status').on(table.status),
    unique('applications_job_id_candidate_id_key').on(table.jobId, table.candidateId),
    check(
      'applications_status_check',
      sql`${table.status} in ('new', 'shortlisted', 'interview_scheduled', 'interviewed', 'offered', 'rejected', 'withdrawn')`,
    ),
    foreignKey({
      name: 'applications_job_id_fkey',
      columns: [table.jobId],
      foreignColumns: [jobs.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'applications_candidate_id_fkey',
      columns: [table.candidateId],
      foreignColumns: [candidates.id],
    }).onDelete('cascade'),
  ],
);

export const interviews = pgTable(
  'interviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id'),
    candidateId: uuid('candidate_id'),
    userId: uuid('user_id').notNull(),
    /**
     * BUG-4: nullable. Never fabricate a timestamp when the slot could not be
     * extracted; `20260916000002_interview_nullable_slot.sql` drops NOT NULL.
     */
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    durationMinutes: integer('duration_minutes').default(30),
    mode: text('mode'),
    meetingLink: text('meeting_link'),
    status: text('status').notNull().default('scheduled'),
    feedback: jsonb('feedback').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [
    index('idx_interviews_application_id').on(table.applicationId),
    index('idx_interviews_candidate_id').on(table.candidateId),
    index('idx_interviews_user_id').on(table.userId),
    index('idx_interviews_scheduled_at').on(table.scheduledAt),
    check('interviews_mode_check', sql`${table.mode} in ('phone', 'video', 'onsite')`),
    check(
      'interviews_status_check',
      sql`${table.status} in ('scheduled', 'completed', 'cancelled', 'no_show')`,
    ),
    foreignKey({
      name: 'interviews_application_id_fkey',
      columns: [table.applicationId],
      foreignColumns: [applications.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'interviews_candidate_id_fkey',
      columns: [table.candidateId],
      foreignColumns: [candidates.id],
    }).onDelete('cascade'),
  ],
);

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    jobId: uuid('job_id'),
    title: text('title').notNull().default('New Hiring Campaign'),
    lastIntent: text('last_intent'),
    pendingConfirmation: jsonb('pending_confirmation').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [
    index('idx_chat_sessions_user_id').on(table.userId),
    index('idx_chat_sessions_job_id').on(table.jobId),
    foreignKey({
      name: 'chat_sessions_job_id_fkey',
      columns: [table.jobId],
      foreignColumns: [jobs.id],
    }).onDelete('set null'),
  ],
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').notNull(),
    userId: uuid('user_id').notNull(),
    role: text('role').notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_chat_messages_session_id').on(table.sessionId),
    index('idx_chat_messages_created_at').on(table.createdAt),
    index('idx_chat_messages_user_id').on(table.userId),
    check('chat_messages_role_check', sql`${table.role} in ('user', 'assistant', 'system')`),
    foreignKey({
      name: 'chat_messages_session_id_fkey',
      columns: [table.sessionId],
      foreignColumns: [chatSessions.id],
    }).onDelete('cascade'),
  ],
);

export const sessionCandidates = pgTable(
  'session_candidates',
  {
    sessionId: uuid('session_id').notNull(),
    candidateId: uuid('candidate_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.candidateId] }),
    index('idx_session_candidates_session_id').on(table.sessionId),
    index('idx_session_candidates_candidate_id').on(table.candidateId),
    foreignKey({
      name: 'session_candidates_session_id_fkey',
      columns: [table.sessionId],
      foreignColumns: [chatSessions.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'session_candidates_candidate_id_fkey',
      columns: [table.candidateId],
      foreignColumns: [candidates.id],
    }).onDelete('cascade'),
  ],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    planId: text('plan_id').notNull(),
    status: text('status').notNull().default('active'),
    razorpayOrderId: text('razorpay_order_id'),
    razorpayPaymentId: text('razorpay_payment_id'),
    razorpaySubscriptionId: text('razorpay_subscription_id'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('idx_subscriptions_user_id').on(table.userId),
    index('idx_subscriptions_status').on(table.status),
    foreignKey({
      name: 'subscriptions_user_id_fkey',
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete('cascade'),
  ],
);

export const creditTransactions = pgTable(
  'credit_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    amount: integer('amount').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_credit_transactions_user_id').on(table.userId),
    index('idx_credit_transactions_created_at').on(table.createdAt.desc()),
    foreignKey({
      name: 'credit_transactions_user_id_fkey',
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete('cascade'),
  ],
);

export const outreachLogs = pgTable(
  'outreach_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    candidateId: uuid('candidate_id'),
    recipientEmail: text('recipient_email').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    templateId: text('template_id'),
    status: text('status').notNull().default('sent'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`timezone('utc'::text, now())`),
  },
  (table) => [
    index('idx_outreach_logs_user_id').on(table.userId),
    index('idx_outreach_logs_candidate_id').on(table.candidateId),
    index('idx_outreach_logs_created_at').on(table.createdAt.desc()),
    foreignKey({
      name: 'outreach_logs_candidate_id_fkey',
      columns: [table.candidateId],
      foreignColumns: [candidates.id],
    }).onDelete('set null'),
  ],
);

/** Schema object used by `drizzle(pool, { schema })` for relational queries. */
export const schema = {
  users,
  jobs,
  candidates,
  resumeChunks,
  applications,
  interviews,
  chatSessions,
  chatMessages,
  sessionCandidates,
  subscriptions,
  creditTransactions,
  outreachLogs,
};

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;
export type ResumeChunk = typeof resumeChunks.$inferSelect;
export type NewResumeChunk = typeof resumeChunks.$inferInsert;
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type Interview = typeof interviews.$inferSelect;
export type NewInterview = typeof interviews.$inferInsert;
export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type SessionCandidate = typeof sessionCandidates.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type OutreachLog = typeof outreachLogs.$inferSelect;
