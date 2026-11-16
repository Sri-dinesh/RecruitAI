import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import request from 'supertest';

import type { FallbackDatabase } from '../src/db/fallback.js';
import {
  APPLICATION_ONE,
  CANDIDATE_ONE,
  CANDIDATE_TWO,
  CANDIDATE_THREE,
  INTERVIEW_ONE,
  JOB_ONE,
  JOB_TWO,
  SESSION_ONE,
  daysAgo,
  seedApplication,
  seedCandidate,
  seedInterview,
  seedJob,
  seedSession,
  withPhase15,
} from './phase15-helpers.js';

const CANDIDATE_FOUR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const APPLICATION_TWO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const APPLICATION_THREE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const APPLICATION_FOUR = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const INTERVIEW_TWO = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function seedAnalytics(db: FallbackDatabase): void {
  seedJob(db, {
    id: JOB_ONE,
    title: 'Platform Engineer',
    status: 'active',
    jd: { role: 'Platform Engineer', required_skills: ['Python', 'TypeScript'] },
    createdAt: daysAgo(20),
  });
  seedJob(db, {
    id: JOB_TWO,
    title: 'Go Engineer',
    status: 'closed',
    jd: { role: 'Go Engineer', required_skills: ['Go'] },
    createdAt: daysAgo(15),
  });

  seedCandidate(db, {
    id: CANDIDATE_ONE,
    name: 'Ada Lovelace',
    createdAt: daysAgo(0),
    metadata: { status: 'shortlisted', match_score: 95, skills: ['Python', 'TypeScript'] },
  });
  seedCandidate(db, {
    id: CANDIDATE_TWO,
    name: 'Grace Hopper',
    createdAt: daysAgo(5),
    metadata: { status: 'offered', match_score: 70, skills: ['Python'] },
  });
  seedCandidate(db, {
    id: CANDIDATE_THREE,
    name: 'Linus Torvalds',
    createdAt: daysAgo(40),
    metadata: { skills: ['Go'] },
  });
  seedCandidate(db, {
    id: CANDIDATE_FOUR,
    name: 'Margaret Hamilton',
    createdAt: daysAgo(1),
    metadata: {},
  });

  seedApplication(db, {
    id: APPLICATION_ONE,
    jobId: JOB_ONE,
    candidateId: CANDIDATE_ONE,
    matchScore: 90,
    status: 'shortlisted',
    createdAt: daysAgo(10),
    updatedAt: daysAgo(5),
  });
  seedApplication(db, {
    id: APPLICATION_TWO,
    jobId: JOB_ONE,
    candidateId: CANDIDATE_TWO,
    matchScore: 60,
    status: 'interviewed',
    createdAt: daysAgo(10),
    updatedAt: daysAgo(8),
  });
  seedApplication(db, {
    id: APPLICATION_THREE,
    jobId: JOB_TWO,
    candidateId: CANDIDATE_THREE,
    matchScore: 40,
    status: 'offered',
    createdAt: daysAgo(10),
    updatedAt: daysAgo(9),
  });
  seedApplication(db, {
    id: APPLICATION_FOUR,
    jobId: JOB_ONE,
    candidateId: CANDIDATE_FOUR,
    matchScore: 50,
    status: 'rejected',
    createdAt: daysAgo(10),
    updatedAt: daysAgo(9),
  });

  seedInterview(db, {
    id: INTERVIEW_ONE,
    candidateId: CANDIDATE_ONE,
    createdAt: daysAgo(10),
    scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  });
  seedInterview(db, {
    id: INTERVIEW_TWO,
    candidateId: CANDIDATE_TWO,
    createdAt: daysAgo(10),
    scheduledAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  });

  seedSession(db, { id: SESSION_ONE, title: 'Campaign' });
}

describe('analytics routes', () => {
  it('returns the KPI summary', async () => {
    await withPhase15(async ({ app, db }) => {
      seedAnalytics(db);
      const response = await request(app).get('/api/analytics/summary').expect(200);
      assert.deepEqual(response.body, {
        total_candidates: 4,
        total_jobs: 2,
        active_jobs: 1,
        total_applications: 4,
        total_shortlisted: 1,
        total_interviews: 2,
        upcoming_interviews: 1,
        total_offered: 1,
        total_rejected: 1,
        avg_match_score: 60,
        total_chat_sessions: 1,
        screening_rate: 25,
        interview_rate: 200,
        offer_rate: 50,
      });
    });
  });

  it('returns the pipeline funnel with percentages', async () => {
    await withPhase15(async ({ app, db }) => {
      seedAnalytics(db);
      const response = await request(app).get('/api/analytics/pipeline').expect(200);
      assert.deepEqual(response.body, [
        { stage: 'Ingested', count: 4, percentage: 100 },
        { stage: 'Shortlisted', count: 1, percentage: 25 },
        { stage: 'Interview', count: 2, percentage: 50 },
        { stage: 'Offer', count: 1, percentage: 25 },
      ]);
    });
  });

  it('returns a zero-filled ingestion time series', async () => {
    await withPhase15(async ({ app, db }) => {
      seedAnalytics(db);
      const response = await request(app)
        .get('/api/analytics/candidates-over-time?days=7')
        .expect(200);
      assert.equal(response.body.length, 7);
      assert.equal(response.body[6].day, new Date().toISOString().slice(0, 10));
      assert.equal(response.body[6].count, 1);
      assert.equal(response.body[5].count, 1);
      assert.equal(response.body[1].count, 1);
    });
  });

  it('validates the days query range', async () => {
    await withPhase15(async ({ app }) => {
      const response = await request(app)
        .get('/api/analytics/candidates-over-time?days=3')
        .expect(422);
      assert.equal(response.body.detail[0].loc[0], 'query');
      assert.equal(response.body.detail[0].loc[1], 'days');
    });
  });

  it('buckets match scores', async () => {
    await withPhase15(async ({ app, db }) => {
      seedAnalytics(db);
      const response = await request(app).get('/api/analytics/match-distribution').expect(200);
      assert.deepEqual(
        response.body.map((bucket: Record<string, unknown>) => [bucket.bucket, bucket.count]),
        [
          ['Top Tier (90-100%)', 1],
          ['Strong Fit (75-89%)', 0],
          ['Good Fit (60-74%)', 1],
          ['Fair Fit (40-59%)', 2],
          ['Low Fit (<40%)', 0],
        ],
      );
    });
  });

  it('weights required skills twice in top skills', async () => {
    await withPhase15(async ({ app, db }) => {
      seedAnalytics(db);
      const response = await request(app).get('/api/analytics/top-skills?top_n=5').expect(200);
      assert.equal(response.body[0].skill, 'Python');
      assert.equal(response.body[0].demand_count, 4);
      // TypeScript and Go both have demand 3; only the leading entry is fixed.
      assert.equal(response.body[1].demand_count, 3);
      assert.ok(['TypeScript', 'Go'].includes(response.body[1].skill));
    });
  });

  it('computes hiring velocity', async () => {
    await withPhase15(async ({ app, db }) => {
      seedAnalytics(db);
      const response = await request(app).get('/api/analytics/hiring-velocity').expect(200);
      assert.equal(response.body.avg_days_to_shortlist, 5);
      assert.equal(response.body.avg_days_to_offer, 1);
      assert.equal(response.body.avg_days_to_interview, 9.5);
      assert.equal(response.body.total_time_tracked, 4);
    });
  });

  it('summarises per-job activity', async () => {
    await withPhase15(async ({ app, db }) => {
      seedAnalytics(db);
      const response = await request(app).get('/api/analytics/jobs-summary').expect(200);
      const byId = new Map<string, Record<string, unknown>>(
        (response.body as Array<Record<string, unknown>>).map((row) => [String(row.job_id), row]),
      );

      const platform = byId.get(JOB_ONE);
      assert.equal(platform?.title, 'Platform Engineer');
      assert.equal(platform?.status, 'active');
      assert.equal(platform?.total_applied, 3);
      assert.equal(platform?.total_shortlisted, 1);
      assert.equal(platform?.total_interviewed, 1);
      assert.equal(platform?.total_offered, 0);
      assert.equal(platform?.avg_match_score, 66.7);

      const go = byId.get(JOB_TWO);
      assert.equal(go?.total_applied, 1);
      assert.equal(go?.total_offered, 1);
      assert.equal(go?.avg_match_score, 40);
    });
  });

  it('returns recent activity capped by the limit', async () => {
    await withPhase15(async ({ app, db }) => {
      seedAnalytics(db);
      const response = await request(app).get('/api/analytics/recent-activity?limit=5').expect(200);
      assert.ok(Array.isArray(response.body));
      assert.ok(response.body.length <= 5);
      for (const event of response.body as Array<Record<string, unknown>>) {
        assert.equal(typeof event.event_type, 'string');
        assert.equal(typeof event.description, 'string');
        assert.equal(typeof event.entity_id, 'string');
        assert.equal(typeof event.occurred_at, 'string');
      }
      assert.ok(
        (response.body as Array<Record<string, unknown>>).some(
          (event) => event.event_type === 'Candidate Ingested',
        ),
      );
      assert.ok(
        (response.body as Array<Record<string, unknown>>).some(
          (event) => event.event_type === 'Status Changed',
        ),
      );
    });
  });

  it('validates the top_n and limit query ranges', async () => {
    await withPhase15(async ({ app }) => {
      const topN = await request(app).get('/api/analytics/top-skills?top_n=4').expect(422);
      assert.equal(topN.body.detail[0].loc[1], 'top_n');

      const limit = await request(app).get('/api/analytics/recent-activity?limit=51').expect(422);
      assert.equal(limit.body.detail[0].loc[1], 'limit');
    });
  });
});
