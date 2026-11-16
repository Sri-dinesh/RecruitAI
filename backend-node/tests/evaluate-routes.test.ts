import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import request from 'supertest';

import { toUuidStr, uuidV5 } from '../src/services/uuid-utils.js';
import {
  APPLICATION_ONE,
  CANDIDATE_ONE,
  CANDIDATE_TWO,
  JOB_ONE,
  OTHER_USER_ID,
  USER_ID,
  seedApplication,
  seedCandidate,
  seedJob,
  seedSession,
  SESSION_ONE,
  withPhase15,
} from './phase15-helpers.js';

describe('candidate evaluation routes', () => {
  it('saves a rubric to candidate metadata and the application', async () => {
    await withPhase15(async ({ app, db }) => {
      seedCandidate(db, { id: CANDIDATE_ONE, metadata: { skills: ['Python'] } });
      seedApplication(db, {
        id: APPLICATION_ONE,
        jobId: JOB_ONE,
        candidateId: CANDIDATE_ONE,
        status: 'new',
        reasoning: { matched_skills: ['Python'] },
      });

      const response = await request(app)
        .post('/api/candidates/evaluate')
        .send({
          candidate_id: CANDIDATE_ONE,
          tech_score: 4,
          comm_score: 5,
          notes: 'Strong systems thinker',
          status: 'shortlisted',
        })
        .expect(200);

      assert.equal(response.body.status, 'success');
      assert.equal(
        response.body.message,
        `Evaluation for candidate '${CANDIDATE_ONE}' saved successfully.`,
      );
      assert.equal(response.body.evaluation.tech_score, 4);
      assert.equal(response.body.evaluation.comm_score, 5);
      assert.equal(response.body.evaluation.notes, 'Strong systems thinker');
      assert.equal(response.body.evaluation.status, 'shortlisted');

      const candidate = db.table('candidates').select().eq('id', CANDIDATE_ONE).execute().data[0];
      const metadata = candidate?.metadata as Record<string, unknown>;
      assert.deepEqual(metadata.rubric, {
        tech_score: 4,
        comm_score: 5,
        notes: 'Strong systems thinker',
        updated_at: String(response.body.evaluation.updated_at),
      });
      assert.equal(metadata.status, 'shortlisted');

      const application = db.table('applications').select().eq('id', APPLICATION_ONE).execute()
        .data[0];
      assert.equal(application?.status, 'shortlisted');
      assert.deepEqual(
        (application?.match_reasoning as Record<string, unknown>).rubric,
        metadata.rubric,
      );

      const user = db.table('users').select().eq('id', USER_ID).execute().data[0];
      assert.equal(user?.credits_balance, 9);
    });
  });

  it('creates a stub candidate and application for a new candidate', async () => {
    await withPhase15(async ({ app, db }) => {
      seedJob(db, { id: JOB_ONE });
      seedSession(db, { id: SESSION_ONE, jobId: JOB_ONE });

      const response = await request(app)
        .post('/api/candidates/evaluate')
        .send({
          candidate_id: 'candidate-1',
          session_id: SESSION_ONE,
          tech_score: 4,
          comm_score: 4,
          notes: '',
        })
        .expect(200);

      assert.equal(response.body.status, 'success');
      const normalized = toUuidStr('candidate-1');
      const candidate = db.table('candidates').select().eq('id', normalized).execute().data[0];
      assert.ok(candidate);
      assert.equal(candidate?.full_name, 'Candidate candidate-1');
      const metadata = candidate?.metadata as Record<string, unknown>;
      assert.equal(metadata.status, 'evaluated');
      assert.equal(metadata.session_id, SESSION_ONE);
      assert.deepEqual(metadata.session_ids, [SESSION_ONE]);

      const applications = db.table('applications').select().execute().data;
      assert.equal(applications.length, 1);
      assert.equal(applications[0]?.job_id, JOB_ONE);
      assert.equal(applications[0]?.match_score, 80);
      assert.equal(applications[0]?.status, 'shortlisted');
    });
  });

  it('returns 402 when the evaluation quota is exhausted', async () => {
    await withPhase15(
      async ({ app }) => {
        const response = await request(app)
          .post('/api/candidates/evaluate')
          .send({
            candidate_id: CANDIDATE_ONE,
            tech_score: 3,
            comm_score: 3,
          })
          .expect(402);
        assert.deepEqual(response.body, {
          detail: {
            error: 'INSUFFICIENT_CREDITS',
            message: 'Candidate evaluation quota reached. Please upgrade to continue.',
            upgrade_url: '/pricing',
          },
        });
      },
      { credits: 0 },
    );
  });

  it('reads the rubric from the application first, then candidate metadata', async () => {
    await withPhase15(async ({ app, db }) => {
      seedCandidate(db, {
        id: CANDIDATE_ONE,
        metadata: {
          status: 'evaluated',
          rubric: { tech_score: 2, comm_score: 2, notes: 'metadata', updated_at: 'old' },
        },
      });
      seedApplication(db, {
        id: APPLICATION_ONE,
        candidateId: CANDIDATE_ONE,
        status: 'shortlisted',
        reasoning: {
          rubric: { tech_score: 5, comm_score: 4, notes: 'application', updated_at: 'new' },
        },
      });

      const response = await request(app)
        .get(`/api/candidates/${CANDIDATE_ONE}/evaluation`)
        .expect(200);
      assert.deepEqual(response.body, {
        candidate_id: CANDIDATE_ONE,
        user_id: USER_ID,
        tech_score: 5,
        comm_score: 4,
        notes: 'application',
        status: 'shortlisted',
        updated_at: 'new',
      });

      const metadataOnly = await request(app)
        .get(`/api/candidates/${CANDIDATE_TWO}/evaluation`)
        .expect(200);
      assert.deepEqual(metadataOnly.body, {
        candidate_id: CANDIDATE_TWO,
        user_id: USER_ID,
        tech_score: 0,
        comm_score: 0,
        notes: '',
        status: null,
      });
    });
  });

  it('exports a CSV ATS payload with the Python headers', async () => {
    await withPhase15(async ({ app, db }) => {
      seedCandidate(db, {
        id: CANDIDATE_ONE,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        metadata: {
          status: 'shortlisted',
          match_score: 91,
          rubric: { tech_score: 5, comm_score: 4, notes: 'Great\nengineer' },
        },
      });
      seedApplication(db, {
        id: APPLICATION_ONE,
        candidateId: CANDIDATE_TWO,
        status: 'new',
        matchScore: 70,
        reasoning: { rubric: { tech_score: 3, comm_score: 3, notes: '' } },
      });

      const response = await request(app)
        .post('/api/export/ats')
        .send({ format: 'CSV' })
        .expect(200);
      assert.match(String(response.headers['content-type']), /^text\/csv/);
      assert.equal(response.headers['content-disposition'], 'attachment; filename=ats_export.csv');
      const rows = response.text.trim().split('\r\n');
      assert.equal(
        rows[0],
        'Candidate ID,Candidate Name,Email,Status,Match Score,Tech Score,Comm Score,Notes',
      );
      assert.ok(rows.some((row) => row.includes('Ada Lovelace')));
      assert.ok(rows.some((row) => row.includes('Great engineer')));
      assert.ok(rows.some((row) => row.includes('Candidate')));
    });
  });

  it('exports a JSON ATS payload scoped to a session', async () => {
    await withPhase15(async ({ app, db }) => {
      seedCandidate(db, {
        id: CANDIDATE_ONE,
        metadata: { session_ids: [SESSION_ONE], status: 'offered', rubric: { tech_score: 4 } },
      });
      seedCandidate(db, { id: CANDIDATE_TWO, metadata: { session_ids: [] } });

      const response = await request(app)
        .post('/api/export/ats')
        .send({ format: 'json', session_id: SESSION_ONE })
        .expect(200);
      assert.equal(response.body.status, 'success');
      assert.equal(response.body.format, 'json');
      assert.equal(response.body.evaluations_count, 1);
      assert.equal(response.body.evaluations[CANDIDATE_ONE].candidate_name, 'Ada Lovelace');
      assert.equal(response.body.evaluations[CANDIDATE_ONE].status, 'offered');
    });
  });

  it('updates candidate status through POST and PATCH', async () => {
    await withPhase15(async ({ app, db }) => {
      seedCandidate(db, { id: CANDIDATE_ONE, metadata: { status: 'new' } });
      seedApplication(db, {
        id: APPLICATION_ONE,
        candidateId: CANDIDATE_ONE,
        status: 'new',
      });

      const response = await request(app)
        .patch(`/api/candidates/${CANDIDATE_ONE}/status`)
        .send({ status: 'shortlisted' })
        .expect(200);
      assert.deepEqual(response.body, {
        status: 'success',
        candidate_id: CANDIDATE_ONE,
        candidate_status: 'shortlisted',
        new_status: 'shortlisted',
      });

      const candidate = db.table('candidates').select().eq('id', CANDIDATE_ONE).execute().data[0];
      assert.equal((candidate?.metadata as Record<string, unknown>).status, 'shortlisted');
      assert.ok((candidate?.metadata as Record<string, unknown>).status_updated_at);
      const application = db.table('applications').select().eq('id', APPLICATION_ONE).execute()
        .data[0];
      assert.equal(application?.status, 'shortlisted');
    });
  });

  it('blocks automated adverse decisions (GDPR Art. 22)', async () => {
    await withPhase15(async ({ app, db }) => {
      seedCandidate(db, { id: CANDIDATE_ONE, metadata: { status: 'new' } });

      const response = await request(app)
        .post(`/api/candidates/${CANDIDATE_ONE}/status`)
        .send({ status: 'Rejected', actor: 'automated_agent' })
        .expect(403);
      assert.deepEqual(response.body, {
        detail:
          'GDPR Art. 22 Violation: Adverse automated hiring decisions prohibited. ' +
          'Candidate rejection requires explicit authenticated human recruiter action.',
      });

      const candidate = db.table('candidates').select().eq('id', CANDIDATE_ONE).execute().data[0];
      assert.equal((candidate?.metadata as Record<string, unknown>).status, 'new');
    });
  });

  it('derives deterministic UUIDs for arbitrary identifiers', () => {
    assert.equal(uuidV5('candidate-1'), 'd7a7a945-f95b-595f-863d-1c849dffa8af');
    assert.equal(uuidV5('local_dev_user_123'), '7ea4c58d-68c5-5dde-898e-ff702107f1f1');
    assert.equal(
      toUuidStr('e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3'),
      'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3',
    );
    assert.equal(
      toUuidStr('E6CCA9B249B84812AC3A3DFB770EA5A3'),
      'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3',
    );
    assert.equal(
      toUuidStr('{E6CCA9B2-49B8-4812-AC3A-3DFB770EA5A3}'),
      'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3',
    );
    assert.equal(toUuidStr(OTHER_USER_ID), OTHER_USER_ID);
  });
});
