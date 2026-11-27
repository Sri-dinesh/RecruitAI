import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import request from 'supertest';
import type { Response as SuperAgentResponse } from 'superagent';

import {
  generateRecruitmentReport,
  maskCandidateName,
  reportSlug,
} from '../src/services/report-generator.js';
import {
  APPLICATION_ONE,
  CANDIDATE_ONE,
  CANDIDATE_TWO,
  INTERVIEW_ONE,
  JOB_ONE,
  SESSION_ONE,
  seedApplication,
  seedCandidate,
  seedChatMessage,
  seedInterview,
  seedJob,
  seedSession,
  withPhase15,
} from './phase15-helpers.js';

function binaryParser(
  response: SuperAgentResponse,
  callback: (error: Error | null, body?: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('report routes', () => {
  it('generates a PDF from an explicit payload', async () => {
    await withPhase15(async ({ app }) => {
      const response = await request(app)
        .post('/api/reports/generate')
        .send({
          jd: {
            role: 'Senior Engineer',
            experience_years: 5,
            required_skills: ['Python', 'TypeScript'],
            tone: 'professional',
            summary: 'Build distributed systems.',
          },
          shortlist: [
            {
              candidate_id: CANDIDATE_ONE,
              name: 'Ada Lovelace',
              match_score: 92,
              status: 'shortlisted',
              matched_skills: ['Python'],
              gaps: ['Kubernetes'],
            },
          ],
          interview_questions: '## Architecture\n- Explain consensus.',
          salary_data: 'Market range: $150k-$180k.',
          scheduled_interviews: [
            {
              candidate_name: 'Ada Lovelace',
              slot: '2026-11-20T10:00:00.000Z',
              booked_at: '2026-11-15T10:00:00.000Z',
            },
          ],
          is_blind_mode: false,
          session_title: 'Senior Engineer Search',
          recruiter_name: 'Dana Scully',
        })
        .buffer(true)
        .parse(binaryParser)
        .expect(200);

      assert.match(String(response.headers['content-type']), /^application\/pdf/);
      assert.equal(
        response.headers['content-disposition'],
        'attachment; filename=recruitment_report.pdf',
      );
      assert.equal(response.headers['access-control-expose-headers'], 'Content-Disposition');
      const body = response.body as Buffer;
      assert.ok(Buffer.isBuffer(body));
      assert.equal(body.subarray(0, 5).toString('latin1'), '%PDF-');
      assert.ok(body.length > 1000);
    });
  });

  it('generates a session report with the slugged filename', async () => {
    await withPhase15(async ({ app, db }) => {
      seedJob(db, {
        id: JOB_ONE,
        jd: { role: 'Senior Engineer', required_skills: ['Python'] },
      });
      seedSession(db, { id: SESSION_ONE, title: 'Campaign', jobId: JOB_ONE });
      seedCandidate(db, {
        id: CANDIDATE_ONE,
        name: 'Ada Lovelace',
        metadata: { skills: ['Python'], experience_years: 8 },
      });
      seedCandidate(db, {
        id: CANDIDATE_TWO,
        name: 'Grace Hopper',
        metadata: { session_ids: [SESSION_ONE] },
      });
      seedApplication(db, {
        id: APPLICATION_ONE,
        jobId: JOB_ONE,
        candidateId: CANDIDATE_ONE,
        matchScore: 91,
        reasoning: {
          matched_skills: ['Python'],
          gaps: [],
          summary: 'Excellent fit',
          rubric: { tech_score: 5, comm_score: 5, notes: 'Hire' },
        },
        status: 'shortlisted',
      });
      seedInterview(db, {
        id: INTERVIEW_ONE,
        candidateId: CANDIDATE_ONE,
        scheduledAt: '2026-11-20T10:00:00.000Z',
        feedback: { booked_at: '2026-11-15T10:00:00.000Z' },
      });
      seedChatMessage(db, {
        id: 'm-1',
        sessionId: SESSION_ONE,
        content: 'Technical interview question: explain consensus.',
      });
      seedChatMessage(db, {
        id: 'm-2',
        sessionId: SESSION_ONE,
        content: 'Salary benchmark: $150k-$180k.',
      });

      const response = await request(app)
        .get(`/api/reports/session/${SESSION_ONE}?blind_mode=true`)
        .buffer(true)
        .parse(binaryParser)
        .expect(200);

      assert.equal(
        response.headers['content-disposition'],
        'attachment; filename=senior_engineer_22222222.pdf',
      );
      const body = response.body as Buffer;
      assert.equal(body.subarray(0, 5).toString('latin1'), '%PDF-');
    });
  });

  it('returns 404 for an unknown session', async () => {
    await withPhase15(async ({ app }) => {
      const response = await request(app).get(`/api/reports/session/${SESSION_ONE}`).expect(404);
      assert.deepEqual(response.body, { detail: 'Campaign session not found.' });
    });
  });

  it('validates the blind_mode query flag', async () => {
    await withPhase15(async ({ app }) => {
      const response = await request(app)
        .get(`/api/reports/session/${SESSION_ONE}?blind_mode=maybe`)
        .expect(422);
      assert.equal(response.body.detail[0].loc[1], 'blind_mode');
    });
  });
});

describe('report generator helpers', () => {
  it('slugs role titles the way Python re_slug does', () => {
    assert.equal(reportSlug('Senior Engineer'), 'senior_engineer');
    assert.equal(reportSlug('  Data/AI - Lead  '), 'data_ai_-_lead');
    assert.equal(reportSlug('!!!'), 'report');
  });

  it('masks candidate names in blind mode', () => {
    assert.equal(maskCandidateName('Ada Lovelace', 1), 'Candidate #1 (A.L.)');
    assert.equal(
      maskCandidateName('  Grace   Brewster Murray Hopper ', 2),
      'Candidate #2 (G.B.M.H.)',
    );
    assert.equal(maskCandidateName('', 3), 'Candidate #3');
  });

  it('produces a valid PDF with empty input', async () => {
    const buffer = await generateRecruitmentReport();
    assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok(buffer.length > 1000);
    assert.ok(Buffer.from(buffer).toString('latin1').includes('/Type /Page'));
  });
});
