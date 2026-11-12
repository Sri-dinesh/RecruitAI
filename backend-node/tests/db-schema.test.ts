import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getTableName } from 'drizzle-orm';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';

import {
  applications,
  candidates,
  chatMessages,
  chatSessions,
  creditTransactions,
  interviews,
  jobs,
  outreachLogs,
  resumeChunks,
  sessionCandidates,
  subscriptions,
  users,
} from '../src/db/schema.js';

function configOf(table: PgTable) {
  return getTableConfig(table);
}

describe('Drizzle schema mapping', () => {
  it('maps every PostgreSQL table used by the backend', () => {
    const tables = [
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
    ];
    assert.deepEqual(tables.map(getTableName), [
      'users',
      'jobs',
      'candidates',
      'resume_chunks',
      'applications',
      'interviews',
      'chat_sessions',
      'chat_messages',
      'session_candidates',
      'subscriptions',
      'credit_transactions',
      'outreach_logs',
    ]);
  });

  it('preserves users columns, defaults and unique email', () => {
    assert.equal(users.id.columnType, 'PgUUID');
    assert.equal(users.email.isUnique, true);
    assert.equal(users.role.default, 'recruiter');
    assert.equal(users.creditsBalance.name, 'credits_balance');
    assert.equal(users.creditsBalance.default, 10);
    assert.equal(users.creditsBalance.notNull, true);
    assert.equal(users.preferences.notNull, true);
    assert.deepEqual(users.preferences.default, {
      email_alerts: true,
      theme: 'system',
      blind_mode_default: false,
      auto_rubric: true,
    });
    const checks = configOf(users).checks.map((check) => check.name);
    assert.ok(checks.includes('users_role_check'));
  });

  it('preserves jobs and candidates contract details', () => {
    assert.equal(jobs.status.default, 'active');
    assert.equal(jobs.rawJd.name, 'raw_jd');
    assert.equal(jobs.jdStructured.name, 'jd_structured');
    assert.equal(candidates.fullName.notNull, true);
    assert.equal(candidates.userId.notNull, true);
    assert.equal(candidates.metadata.hasDefault, true);
    assert.equal(JSON.stringify(candidates.metadata.default), '{}');

    assert.deepEqual(
      configOf(candidates).uniqueConstraints.map((constraint) => ({
        name: constraint.name,
        columns: constraint.columns.map((column) => column.name),
      })),
      [{ name: 'candidates_user_id_email_key', columns: ['user_id', 'email'] }],
    );
  });

  it('keeps resume chunk embeddings as 384-dimension pgvector values', () => {
    assert.equal(resumeChunks.embedding.columnType, 'PgCustomColumn');
    assert.equal(resumeChunks.embedding.getSQLType(), 'vector(384)');
    assert.equal(resumeChunks.embedding.mapToDriverValue([0.25, -1]), '[0.25,-1]');
    assert.deepEqual(resumeChunks.embedding.mapFromDriverValue('[0.25,-1]'), [0.25, -1]);
    const embeddingIndex = configOf(resumeChunks).indexes.find(
      (index) => index.config.name === 'idx_resume_chunks_embedding',
    );
    assert.ok(embeddingIndex);
    assert.equal(embeddingIndex.config.method, 'ivfflat');
    assert.deepEqual(embeddingIndex.config.with, { lists: 100 });
  });

  it('preserves the applications composite unique key and status enum', () => {
    assert.deepEqual(
      configOf(applications).uniqueConstraints.map((constraint) => ({
        name: constraint.name,
        columns: constraint.columns.map((column) => column.name),
      })),
      [{ name: 'applications_job_id_candidate_id_key', columns: ['job_id', 'candidate_id'] }],
    );
    const checkNames = configOf(applications).checks.map((check) => check.name);
    assert.deepEqual(checkNames, ['applications_status_check']);
    assert.equal(applications.matchScore.columnType, 'PgNumericNumber');
  });

  it('keeps interviews.scheduled_at nullable with a 30 minute default', () => {
    assert.equal(interviews.scheduledAt.name, 'scheduled_at');
    assert.equal(interviews.scheduledAt.notNull, false);
    assert.equal(interviews.durationMinutes.default, 30);
    assert.equal(interviews.mode.notNull, false);
    assert.equal(interviews.status.default, 'scheduled');
    assert.deepEqual(
      configOf(interviews).checks.map((check) => check.name),
      ['interviews_mode_check', 'interviews_status_check'],
    );
  });

  it('preserves chat, join-table and monetization columns', () => {
    assert.equal(chatSessions.title.default, 'New Hiring Campaign');
    assert.equal(chatSessions.pendingConfirmation.name, 'pending_confirmation');
    assert.equal(chatMessages.metadata.name, 'metadata');
    assert.equal(chatMessages.role.notNull, true);
    assert.equal(creditTransactions.balanceAfter.name, 'balance_after');
    assert.equal(creditTransactions.amount.notNull, true);
    assert.equal(subscriptions.razorpaySubscriptionId.name, 'razorpay_subscription_id');
    assert.equal(outreachLogs.recipientEmail.name, 'recipient_email');
    assert.equal(outreachLogs.errorMessage.name, 'error_message');
  });

  it('uses a composite primary key for session_candidates', () => {
    const primaryKeys = configOf(sessionCandidates).primaryKeys;
    assert.equal(primaryKeys.length, 1);
    assert.deepEqual(
      primaryKeys[0]?.columns.map((column) => column.name),
      ['session_id', 'candidate_id'],
    );
  });

  it('declares the cascade semantics used by GDPR purges', () => {
    const key = (table: PgTable) =>
      configOf(table).foreignKeys.map((fk) => ({
        name: fk.getName(),
        columns: fk.reference().columns.map((column) => column.name),
        onDelete: fk.onDelete,
      }));

    assert.deepEqual(key(resumeChunks), [
      {
        name: 'resume_chunks_candidate_id_fkey',
        columns: ['candidate_id'],
        onDelete: 'cascade',
      },
    ]);
    assert.deepEqual(key(applications), [
      { name: 'applications_job_id_fkey', columns: ['job_id'], onDelete: 'cascade' },
      { name: 'applications_candidate_id_fkey', columns: ['candidate_id'], onDelete: 'cascade' },
    ]);
    assert.deepEqual(key(interviews), [
      {
        name: 'interviews_application_id_fkey',
        columns: ['application_id'],
        onDelete: 'cascade',
      },
      { name: 'interviews_candidate_id_fkey', columns: ['candidate_id'], onDelete: 'cascade' },
    ]);
    assert.deepEqual(key(chatSessions), [
      { name: 'chat_sessions_job_id_fkey', columns: ['job_id'], onDelete: 'set null' },
    ]);
    assert.deepEqual(key(sessionCandidates), [
      {
        name: 'session_candidates_session_id_fkey',
        columns: ['session_id'],
        onDelete: 'cascade',
      },
      {
        name: 'session_candidates_candidate_id_fkey',
        columns: ['candidate_id'],
        onDelete: 'cascade',
      },
    ]);
    assert.deepEqual(key(outreachLogs), [
      {
        name: 'outreach_logs_candidate_id_fkey',
        columns: ['candidate_id'],
        onDelete: 'set null',
      },
    ]);
  });

  it('declares the indexes required by the migrations', () => {
    const expected: ReadonlyArray<[PgTable, string]> = [
      [jobs, 'idx_jobs_user_id'],
      [candidates, 'idx_candidates_user_id'],
      [applications, 'idx_applications_user_id'],
      [interviews, 'idx_interviews_scheduled_at'],
      [chatSessions, 'idx_chat_sessions_user_id'],
      [chatMessages, 'idx_chat_messages_user_id'],
      [sessionCandidates, 'idx_session_candidates_candidate_id'],
      [subscriptions, 'idx_subscriptions_user_id'],
      [creditTransactions, 'idx_credit_transactions_created_at'],
      [outreachLogs, 'idx_outreach_logs_created_at'],
    ];
    for (const [table, indexName] of expected) {
      assert.ok(
        configOf(table).indexes.some((index) => index.config.name === indexName),
        `${getTableName(table)} should declare ${indexName}`,
      );
    }
  });
});
