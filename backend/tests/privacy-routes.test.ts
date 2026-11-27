import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import request from 'supertest';

import {
  APPLICATION_ONE,
  CANDIDATE_ONE,
  CANDIDATE_TWO,
  INTERVIEW_ONE,
  JOB_ONE,
  OTHER_USER_ID,
  SESSION_ONE,
  USER_ID,
  daysAgo,
  seedApplication,
  seedCandidate,
  seedChatMessage,
  seedInterview,
  seedJob,
  seedResumeChunk,
  seedSession,
  seedSessionCandidate,
  withPhase15,
} from './phase15-helpers.js';

const CHUNK_ONE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('privacy routes', () => {
  it('exports all candidate data (GDPR Art. 15/20)', async () => {
    await withPhase15(async ({ app, db }) => {
      seedCandidate(db, {
        id: CANDIDATE_ONE,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        metadata: { skills: ['Python'] },
      });
      seedApplication(db, {
        id: APPLICATION_ONE,
        jobId: JOB_ONE,
        candidateId: CANDIDATE_ONE,
        matchScore: 88,
        reasoning: { summary: 'Strong' },
        status: 'shortlisted',
      });
      seedInterview(db, { id: INTERVIEW_ONE, candidateId: CANDIDATE_ONE });
      seedResumeChunk(db, { id: CHUNK_ONE, candidateId: CANDIDATE_ONE });

      const response = await request(app).get(`/api/privacy/export/${CANDIDATE_ONE}`).expect(200);
      assert.equal(response.body.candidate.id, CANDIDATE_ONE);
      assert.equal(response.body.candidate.full_name, 'Ada Lovelace');
      assert.equal(response.body.applications.length, 1);
      assert.equal(response.body.applications[0].match_score, 88);
      assert.equal(response.body.applications[0].job_id, JOB_ONE);
      assert.equal(response.body.interviews.length, 1);
      assert.equal(response.body.interviews[0].scheduled_at, '2026-11-20T10:00:00.000Z');
      assert.equal(response.body.vector_chunks_stored, 1);
      assert.equal(response.body.export_metadata.gdpr_compliance, 'Articles 15 & 20');
      assert.equal(response.body.export_metadata.tenant_user_id, USER_ID);
    });
  });

  it('returns 404 for an unknown candidate export', async () => {
    await withPhase15(async ({ app }) => {
      const response = await request(app).get(`/api/privacy/export/${CANDIDATE_ONE}`).expect(404);
      assert.deepEqual(response.body, { detail: 'Candidate not found or access denied.' });
    });
  });

  it('cascades candidate erasure across dependent tables', async () => {
    await withPhase15(async ({ app, db }) => {
      seedSession(db, { id: SESSION_ONE });
      seedCandidate(db, { id: CANDIDATE_ONE });
      seedCandidate(db, { id: CANDIDATE_TWO, userId: OTHER_USER_ID });
      seedApplication(db, {
        id: APPLICATION_ONE,
        candidateId: CANDIDATE_ONE,
      });
      seedApplication(db, {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        candidateId: CANDIDATE_TWO,
        userId: OTHER_USER_ID,
      });
      seedInterview(db, { id: INTERVIEW_ONE, candidateId: CANDIDATE_ONE });
      seedResumeChunk(db, { id: CHUNK_ONE, candidateId: CANDIDATE_ONE });
      seedSessionCandidate(db, SESSION_ONE, CANDIDATE_ONE);
      seedSessionCandidate(db, SESSION_ONE, CANDIDATE_TWO);

      const response = await request(app)
        .delete(`/api/privacy/candidates/${CANDIDATE_ONE}`)
        .expect(200);
      assert.deepEqual(response.body, {
        success: true,
        message: `Candidate ${CANDIDATE_ONE} and all associated PII, vector chunks, and evaluations permanently erased.`,
      });

      assert.equal(
        db.table('candidates').select().eq('id', CANDIDATE_ONE).execute().data.length,
        0,
      );
      assert.equal(
        db.table('applications').select().eq('candidate_id', CANDIDATE_ONE).execute().data.length,
        0,
      );
      assert.equal(
        db.table('interviews').select().eq('candidate_id', CANDIDATE_ONE).execute().data.length,
        0,
      );
      assert.equal(
        db.table('resume_chunks').select().eq('candidate_id', CANDIDATE_ONE).execute().data.length,
        0,
      );
      assert.equal(
        db.table('session_candidates').select().eq('candidate_id', CANDIDATE_ONE).execute().data
          .length,
        0,
      );

      // The other tenant is untouched.
      assert.equal(
        db.table('candidates').select().eq('id', CANDIDATE_TWO).execute().data.length,
        1,
      );
      assert.equal(
        db.table('applications').select().eq('candidate_id', CANDIDATE_TWO).execute().data.length,
        1,
      );
      assert.equal(
        db.table('session_candidates').select().eq('candidate_id', CANDIDATE_TWO).execute().data
          .length,
        1,
      );
    });
  });

  it('returns 404 when erasing a candidate twice', async () => {
    await withPhase15(async ({ app }) => {
      const response = await request(app)
        .delete(`/api/privacy/candidates/${CANDIDATE_ONE}`)
        .expect(404);
      assert.deepEqual(response.body, { detail: 'Candidate not found or already erased.' });
    });
  });

  it('runs the tiered retention policy for the current tenant', async () => {
    await withPhase15(async ({ app, db }) => {
      seedSession(db, { id: SESSION_ONE });
      seedCandidate(db, {
        id: CANDIDATE_ONE,
        createdAt: daysAgo(200),
        rawResumeText: 'old resume',
      });
      seedCandidate(db, {
        id: CANDIDATE_TWO,
        createdAt: daysAgo(1),
        rawResumeText: 'fresh resume',
      });
      seedCandidate(db, {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        userId: OTHER_USER_ID,
        createdAt: daysAgo(200),
        rawResumeText: 'other resume',
      });
      seedChatMessage(db, {
        id: 'old-message',
        sessionId: SESSION_ONE,
        content: 'old chat',
        createdAt: daysAgo(400),
      });
      seedChatMessage(db, {
        id: 'new-message',
        sessionId: SESSION_ONE,
        content: 'new chat',
        createdAt: daysAgo(1),
      });
      seedChatMessage(db, {
        id: 'other-message',
        sessionId: SESSION_ONE,
        userId: OTHER_USER_ID,
        content: 'other chat',
        createdAt: daysAgo(400),
      });

      const response = await request(app).post('/api/privacy/retention/run').expect(200);
      assert.deepEqual(response.body, {
        success: true,
        summary: { raw_resumes_cleared: 1, chat_messages_purged: 1 },
      });

      assert.equal(
        db.table('candidates').select().eq('id', CANDIDATE_ONE).execute().data[0]?.raw_resume_text,
        null,
      );
      assert.equal(
        db.table('candidates').select().eq('id', CANDIDATE_TWO).execute().data[0]?.raw_resume_text,
        'fresh resume',
      );
      assert.equal(
        db.table('candidates').select().eq('id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb').execute()
          .data[0]?.raw_resume_text,
        'other resume',
      );
      assert.deepEqual(
        db
          .table('chat_messages')
          .select()
          .execute()
          .data.map((row) => row['id'])
          .sort(),
        ['new-message', 'other-message'],
      );
    });
  });

  it('reports insufficient data for an empty bias audit', async () => {
    await withPhase15(async ({ app }) => {
      const response = await request(app).get('/api/privacy/bias-audit').expect(200);
      assert.equal(response.body.law_compliance, 'NYC Local Law 144 (AEDT)');
      assert.equal(response.body.sample_size, 0);
      assert.equal(response.body.status, 'insufficient_data');
      assert.equal(
        response.body.message,
        'No evaluated candidate applications found for bias audit.',
      );
      assert.match(String(response.body.audit_timestamp), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });
  });

  it('computes the AEDT bias audit statistics', async () => {
    await withPhase15(async ({ app, db }) => {
      const scores: Array<[string, number, string]> = [
        ['11111111-1111-4111-8111-111111111111', 95, 'offered'],
        ['22222222-2222-4222-8222-222222222222', 85, 'shortlisted'],
        ['33333333-3333-4333-8333-333333333333', 65, 'new'],
        ['44444444-4444-4444-8444-444444444444', 45, 'rejected'],
        ['55555555-5555-4555-8555-555555555555', 25, 'new'],
      ];
      for (const [index, [candidateId, score, status]] of scores.entries()) {
        seedApplication(db, {
          id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa${index}`,
          candidateId,
          matchScore: score,
          status,
        });
      }

      const response = await request(app).get('/api/privacy/bias-audit').expect(200);
      assert.equal(response.body.sample_size, 5);
      assert.deepEqual(response.body.metrics, {
        mean_score: 63,
        std_deviation: 25.61,
        median_score: 65,
        p20_score: 45,
        p80_score: 95,
        selection_rate: 0.4,
        impact_ratio: 0.474,
        adverse_impact_flagged: true,
      });
      assert.deepEqual(response.body.score_distribution, {
        '0-20': 0,
        '21-40': 1,
        '41-60': 1,
        '61-80': 1,
        '81-100': 2,
      });
      assert.deepEqual(response.body.certification, {
        audited_by: 'RecruitAI Autonomous AEDT Auditor',
        compliant_with_four_fifths_rule: false,
      });
    });
  });

  it('exports recruiter data and purges the account cascade', async () => {
    await withPhase15(async ({ app, db }) => {
      seedJob(db, { id: JOB_ONE });
      seedSession(db, { id: SESSION_ONE, title: 'Campaign' });
      seedCandidate(db, { id: CANDIDATE_ONE });
      seedCandidate(db, { id: CANDIDATE_TWO, userId: OTHER_USER_ID });

      const exported = await request(app).get('/api/privacy/user/export').expect(200);
      assert.equal(exported.body.export_metadata.user_id, USER_ID);
      assert.equal(
        exported.body.export_metadata.law_compliance,
        'GDPR Art. 15 (Right of Access) & Art. 20 (Data Portability)',
      );
      assert.equal(exported.body.campaign_sessions_count, 1);
      assert.deepEqual(exported.body.campaign_sessions[0], {
        id: SESSION_ONE,
        title: 'Campaign',
        created_at: exported.body.campaign_sessions[0].created_at,
        updated_at: exported.body.campaign_sessions[0].updated_at,
      });
      assert.equal(exported.body.candidates_count, 1);
      assert.equal(exported.body.candidates[0].id, CANDIDATE_ONE);

      const deleted = await request(app).delete('/api/privacy/user/account').expect(200);
      assert.deepEqual(deleted.body, {
        success: true,
        message:
          'User account and all associated workspace tenant data have been permanently erased under GDPR Art. 17.',
      });

      assert.equal(db.table('users').select().eq('id', USER_ID).execute().data.length, 0);
      assert.equal(
        db.table('candidates').select().eq('id', CANDIDATE_ONE).execute().data.length,
        0,
      );
      assert.equal(
        db.table('chat_sessions').select().eq('id', SESSION_ONE).execute().data.length,
        0,
      );
      assert.equal(db.table('jobs').select().eq('id', JOB_ONE).execute().data.length, 0);

      assert.equal(db.table('users').select().eq('id', OTHER_USER_ID).execute().data.length, 0);
      assert.equal(
        db.table('candidates').select().eq('id', CANDIDATE_TWO).execute().data.length,
        1,
      );
    });
  });
});
