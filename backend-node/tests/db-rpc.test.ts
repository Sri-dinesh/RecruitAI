import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PgDialect } from 'drizzle-orm/pg-core';

import { createRpcClient, toVectorLiteral, type QueryExecutor } from '../src/db/rpc.js';

const dialect = new PgDialect();

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

function recorder(rows: unknown): { calls: RecordedQuery[]; execute: QueryExecutor } {
  const calls: RecordedQuery[] = [];
  const execute: QueryExecutor = async (query) => {
    const { sql, params } = dialect.sqlToQuery(query);
    calls.push({ sql, params });
    return { rows };
  };
  return { calls, execute };
}

describe('RPC argument contract', () => {
  it('calls every analytics function with the PostgreSQL argument names', async () => {
    const { calls, execute } = recorder([]);
    const rpc = createRpcClient(execute);

    await rpc.analyticsSummary('user-1');
    await rpc.pipelineFunnel('user-1');
    await rpc.candidatesOverTime('user-1');
    await rpc.matchScoreDistribution('user-1');
    await rpc.topSkills('user-1');
    await rpc.hiringVelocity('user-1');
    await rpc.jobsSummary('user-1');
    await rpc.recentActivity('user-1');
    await rpc.resetUserWorkspace('user-1');

    const sql = calls.map((call) => call.sql).join('\n');
    assert.match(sql, /public\.get_analytics_summary\(p_user_id => \$1\)/);
    assert.match(sql, /public\.get_pipeline_funnel\(p_user_id => \$1\)/);
    assert.match(sql, /public\.get_candidates_over_time\(p_user_id => \$1, days => \$2\)/);
    assert.match(sql, /public\.get_match_score_distribution\(p_user_id => \$1\)/);
    assert.match(sql, /public\.get_top_skills\(p_user_id => \$1, top_n => \$2\)/);
    assert.match(sql, /public\.get_hiring_velocity\(p_user_id => \$1\)/);
    assert.match(sql, /public\.get_jobs_summary\(p_user_id => \$1\)/);
    assert.match(sql, /public\.get_recent_activity\(p_user_id => \$1, limit_n => \$2\)/);
    assert.match(sql, /public\.reset_user_workspace\(target_user_id => \$1\)/);

    assert.deepEqual(calls[2]?.params, ['user-1', 30]);
    assert.deepEqual(calls[4]?.params, ['user-1', 12]);
    assert.deepEqual(calls[7]?.params, ['user-1', 20]);
  });

  it('keeps the documented defaults and custom values', async () => {
    const { calls, execute } = recorder([]);
    const rpc = createRpcClient(execute);
    await rpc.candidatesOverTime('user-1', 7);
    await rpc.topSkills('user-1', 5);
    await rpc.recentActivity('user-1', 50);
    assert.deepEqual(
      calls.map((call) => call.params),
      [
        ['user-1', 7],
        ['user-1', 5],
        ['user-1', 50],
      ],
    );
  });

  it('passes pgvector matches with a vector literal and nullable filters', async () => {
    const { calls, execute } = recorder([]);
    const rpc = createRpcClient(execute);
    await rpc.matchResumeChunks({ queryEmbedding: [0.1, 0.2] });
    await rpc.matchResumeChunks({
      queryEmbedding: [1, 2, 3],
      matchThreshold: 0.75,
      matchCount: 5,
      candidateId: 'candidate-1',
      userId: 'user-1',
    });

    assert.match(calls[0]?.sql ?? '', /query_embedding => \$1::vector/);
    assert.deepEqual(calls[0]?.params, ['[0.1,0.2]', 0, 3, null, null]);
    assert.deepEqual(calls[1]?.params, ['[1,2,3]', 0.75, 5, 'candidate-1', 'user-1']);
  });

  it('formats vector literals without spaces', () => {
    assert.equal(toVectorLiteral([1, -2.5, 0]), '[1,-2.5,0]');
  });
});

describe('RPC result mapping', () => {
  it('maps analytics summary jsonb and coerces numeric strings', async () => {
    const { execute } = recorder([
      {
        data: {
          total_candidates: '3',
          total_jobs: 2,
          active_jobs: '1',
          total_applications: '4',
          total_shortlisted: '2',
          total_interviews: '1',
          upcoming_interviews: '0',
          total_offered: '1',
          total_rejected: '0',
          avg_match_score: '88.5',
          total_chat_sessions: '2',
        },
      },
    ]);
    const summary = await createRpcClient(execute).analyticsSummary('user-1');
    assert.deepEqual(summary, {
      total_candidates: 3,
      total_jobs: 2,
      active_jobs: 1,
      total_applications: 4,
      total_shortlisted: 2,
      total_interviews: 1,
      upcoming_interviews: 0,
      total_offered: 1,
      total_rejected: 0,
      avg_match_score: 88.5,
      total_chat_sessions: 2,
    });
  });

  it('returns null avg_match_score when no application has a score', async () => {
    const { execute } = recorder([{ data: { avg_match_score: null } }]);
    const summary = await createRpcClient(execute).analyticsSummary('user-1');
    assert.equal(summary.avg_match_score, null);
    assert.equal(summary.total_candidates, 0);
  });

  it('maps pipeline funnel and candidates-over-time rows', async () => {
    const funnelRows = [
      { stage: 'New', count: '5', percentage: '50.0' },
      { stage: 'Offered', count: 1n, percentage: 10 },
    ];
    const funnel = await createRpcClient(recorder(funnelRows).execute).pipelineFunnel('user-1');
    assert.deepEqual(funnel, [
      { stage: 'New', count: 5, percentage: 50 },
      { stage: 'Offered', count: 1, percentage: 10 },
    ]);

    const points = await createRpcClient(
      recorder([{ day: '2026-11-01', count: '2' }]).execute,
    ).candidatesOverTime('user-1');
    assert.deepEqual(points, [{ day: '2026-11-01', count: 2 }]);
  });

  it('maps score distribution and top skills', async () => {
    const distribution = await createRpcClient(
      recorder([{ bucket: 'Strong Fit (75-89%)', count: '4', min_score: 75, max_score: 89 }])
        .execute,
    ).matchScoreDistribution('user-1');
    assert.deepEqual(distribution, [
      { bucket: 'Strong Fit (75-89%)', count: 4, min_score: 75, max_score: 89 },
    ]);

    const skills = await createRpcClient(
      recorder([{ skill: 'typescript', demand_count: '7' }]).execute,
    ).topSkills('user-1');
    assert.deepEqual(skills, [{ skill: 'typescript', demand_count: 7 }]);
  });

  it('maps hiring velocity jsonb values', async () => {
    const velocity = await createRpcClient(
      recorder([
        {
          data: {
            avg_days_to_shortlist: '2.5',
            avg_days_to_interview: 4,
            avg_days_to_offer: '9.1',
            total_time_tracked: '12',
          },
        },
      ]).execute,
    ).hiringVelocity('user-1');
    assert.deepEqual(velocity, {
      avg_days_to_shortlist: 2.5,
      avg_days_to_interview: 4,
      avg_days_to_offer: 9.1,
      total_time_tracked: 12,
    });
  });

  it('maps jobs summary without losing timestamps', async () => {
    const createdAt = new Date('2026-11-01T10:00:00.000Z');
    const rows = await createRpcClient(
      recorder([
        {
          job_id: 'job-1',
          title: 'Engineer',
          status: 'active',
          created_at: createdAt,
          total_applied: '9',
          total_shortlisted: '4',
          total_interviewed: '2',
          total_offered: '1',
          avg_match_score: '81.25',
        },
      ]).execute,
    ).jobsSummary('user-1');
    assert.deepEqual(rows, [
      {
        job_id: 'job-1',
        title: 'Engineer',
        status: 'active',
        created_at: createdAt,
        total_applied: 9,
        total_shortlisted: 4,
        total_interviewed: 2,
        total_offered: 1,
        avg_match_score: 81.25,
      },
    ]);
  });

  it('maps recent activity and reset workspaces', async () => {
    const occurredAt = new Date('2026-11-02T09:30:00.000Z');
    const events = await createRpcClient(
      recorder([
        {
          event_type: 'candidate_added',
          description: 'New resume: Ada',
          entity_id: 'candidate-1',
          occurred_at: occurredAt,
        },
      ]).execute,
    ).recentActivity('user-1');
    assert.deepEqual(events, [
      {
        event_type: 'candidate_added',
        description: 'New resume: Ada',
        entity_id: 'candidate-1',
        occurred_at: occurredAt,
      },
    ]);

    const reset = await createRpcClient(
      recorder([
        {
          data: {
            success: true,
            user_id: 'user-1',
            reset_at: '2026-11-02T09:30:00.000Z',
          },
        },
      ]).execute,
    ).resetUserWorkspace('user-1');
    assert.deepEqual(reset, {
      success: true,
      user_id: 'user-1',
      reset_at: '2026-11-02T09:30:00.000Z',
    });
  });

  it('maps vector match rows including full_name and similarity', async () => {
    const matches = await createRpcClient(
      recorder([
        {
          id: 'chunk-1',
          candidate_id: 'candidate-1',
          full_name: 'Ada Lovelace',
          chunk_text: 'Built analytical engines',
          similarity: '0.91',
        },
      ]).execute,
    ).matchResumeChunks({ queryEmbedding: [1, 0] });
    assert.deepEqual(matches, [
      {
        id: 'chunk-1',
        candidate_id: 'candidate-1',
        full_name: 'Ada Lovelace',
        chunk_text: 'Built analytical engines',
        similarity: 0.91,
      },
    ]);
  });

  it('tolerates empty results', async () => {
    const rpc = createRpcClient(recorder([]).execute);
    assert.deepEqual(await rpc.pipelineFunnel('user-1'), []);
    assert.deepEqual(await rpc.matchResumeChunks({ queryEmbedding: [1] }), []);
  });
});
