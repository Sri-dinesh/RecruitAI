import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { UnauthorizedError } from '../src/types/errors.js';
import { loadConfig, type AppConfig } from '../src/config/index.js';
import { FallbackDatabase } from '../src/db/fallback.js';
import { createSqliteWorkspaceStore, type WorkspaceStore } from '../src/db/workspace-store.js';
import type { Candidate } from '../src/schemas/candidate.js';
import type { JobDescription } from '../src/schemas/jd.js';
import {
  computeResumeHash,
  IngestionService,
  resolveFilenameAndExtension,
} from '../src/services/ingestion-service.js';

const USER_ID = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';
const OTHER_USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-14T10:00:00.000Z');

const RESUME_TEXT =
  'Ada Lovelace is a senior engineer with deep Python, TypeScript and PostgreSQL experience. ' +
  'She has shipped distributed systems and mentored engineers for over eight years.';

function config(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({
    USE_LOCAL_AUTH: 'true',
    LOCAL_DEV_USER_ID: USER_ID,
    GEMINI_API_KEY: '',
    GOOGLE_API_KEY: '',
    ...overrides,
  });
}

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    candidate_id: 'ada_lovelace',
    name: 'Ada Lovelace',
    raw_text: RESUME_TEXT,
    match_score: null,
    matched_skills: [],
    gaps: [],
    experience_years: 8,
    red_flags: [],
    email: 'ada@example.com',
    phone: null,
    location: null,
    headline: null,
    summary: null,
    skills: ['Python', 'TypeScript', 'PostgreSQL'],
    work_experience: [],
    education: [],
    certifications: [],
    links: [],
    languages: [],
    consent_at: null,
    consent_version: '1.0',
    source: 'direct_upload',
    ...overrides,
  };
}

function jobDescription(overrides: Partial<JobDescription> = {}): JobDescription {
  return {
    role: 'Senior Engineer',
    required_skills: ['Python', 'TypeScript'],
    experience_years: 5,
    raw_text: '',
    tone: 'professional',
    company_name: null,
    department: null,
    location: null,
    employment_type: null,
    salary_range: null,
    education_requirements: null,
    preferred_skills: [],
    responsibilities: [],
    qualifications: [],
    benefits: [],
    industry: null,
    summary: null,
    ...overrides,
  };
}

interface Harness {
  readonly db: FallbackDatabase;
  readonly store: WorkspaceStore;
  readonly service: IngestionService;
  readonly config: AppConfig;
}

async function withService<T>(
  fn: (harness: Harness) => Promise<T> | T,
  overrides: Record<string, string | undefined> = {},
): Promise<T> {
  const cfg = config(overrides);
  const db = new FallbackDatabase(':memory:', cfg);
  try {
    const store = createSqliteWorkspaceStore(db);
    const service = new IngestionService({
      config: cfg,
      store,
      // Two-dimensional vectors keep the fixtures small; the store is agnostic.
      embedTexts: async (texts) => texts.map((text, index) => [index + 1, text.length > 0 ? 1 : 0]),
      now: () => NOW,
    });
    return await fn({ db, store, service, config: cfg });
  } finally {
    db.close();
  }
}

function candidateRow(db: FallbackDatabase, id: string): Record<string, unknown> | undefined {
  return db.table('candidates').select().eq('id', id).execute().data[0];
}

describe('computeResumeHash', () => {
  it('normalizes whitespace and casing and rejects short text', () => {
    assert.equal(computeResumeHash(null), null);
    assert.equal(computeResumeHash('   short   '), null);
    assert.equal(
      computeResumeHash('  Ada   Lovelace\nSenior   Engineer  '),
      computeResumeHash('ada lovelace senior engineer'),
    );
    assert.equal(
      computeResumeHash('Ada Lovelace Senior Engineer Professional'),
      computeResumeHash('ADA LOVELACE SENIOR ENGINEER PROFESSIONAL'),
    );
  });
});

describe('resolveFilenameAndExtension', () => {
  it('keeps an explicit extension', () => {
    assert.deepEqual(resolveFilenameAndExtension('resume.PDF', 'text/plain', Buffer.from('x')), {
      filename: 'resume.PDF',
      extension: '.pdf',
    });
  });

  it('infers from Content-Type', () => {
    assert.deepEqual(
      resolveFilenameAndExtension('upload', 'application/pdf', Buffer.from('not a pdf')),
      { filename: 'upload.pdf', extension: '.pdf' },
    );
  });

  it('infers from magic bytes and defaults to txt', () => {
    assert.deepEqual(resolveFilenameAndExtension('upload', '', Buffer.from('%PDF-1.7')), {
      filename: 'upload.pdf',
      extension: '.pdf',
    });
    assert.deepEqual(
      resolveFilenameAndExtension('upload', '', Buffer.from([0x50, 0x4b, 0x03, 0x04])),
      { filename: 'upload.docx', extension: '.docx' },
    );
    assert.deepEqual(resolveFilenameAndExtension('upload', '', Buffer.from('hello')), {
      filename: 'upload.txt',
      extension: '.txt',
    });
  });

  it('falls back to candidate_document for a blank filename', () => {
    assert.deepEqual(resolveFilenameAndExtension('', '', Buffer.from('hello')), {
      filename: 'candidate_document.txt',
      extension: '.txt',
    });
  });
});

describe('upsertCandidateRecord', () => {
  it('deduplicates by normalized resume hash and merges session associations', async () => {
    await withService(async ({ db, store, service }) => {
      await store.insertSession({ id: SESSION, userId: USER_ID, title: 'New Hiring Campaign' });
      const secondSession = '33333333-3333-4333-8333-333333333333';
      await store.insertSession({ id: secondSession, userId: USER_ID, title: 'Second' });

      const firstId = await service.upsertCandidateRecord(candidate(), USER_ID, SESSION);
      const secondId = await service.upsertCandidateRecord(
        candidate({
          name: 'Ada Updated',
          email: 'different@example.com',
          skills: ['Python', 'Rust'],
          raw_text: `  ${RESUME_TEXT.replaceAll(' ', '   ')}  `,
        }),
        USER_ID,
        secondSession,
      );

      assert.equal(firstId, secondId);
      assert.equal(db.table('candidates').select().execute().data.length, 1);

      const row = candidateRow(db, firstId);
      assert.equal(row?.email, 'ada@example.com');
      assert.equal(row?.full_name, 'Ada Updated');
      assert.deepEqual((row?.metadata as Record<string, unknown>).skills, ['Python', 'Rust']);
      assert.deepEqual((row?.metadata as Record<string, unknown>).session_ids, [
        SESSION,
        secondSession,
      ]);
      assert.equal((row?.metadata as Record<string, unknown>).session_id, secondSession);
      assert.equal((row?.metadata as Record<string, unknown>).consent_at, NOW.toISOString());
      assert.notEqual((row?.metadata as Record<string, unknown>).resume_hash, null);

      const links = db.table('session_candidates').select().execute().data;
      assert.equal(links.length, 2);
    });
  });

  it('deduplicates by verified email when the resume text differs', async () => {
    await withService(async ({ db, service }) => {
      const firstId = await service.upsertCandidateRecord(candidate(), USER_ID);
      const secondId = await service.upsertCandidateRecord(
        candidate({
          name: 'Ada Second',
          raw_text: 'Completely different resume text that exceeds the twenty character minimum.',
          skills: ['Go'],
        }),
        USER_ID,
      );

      assert.equal(firstId, secondId);
      assert.equal(db.table('candidates').select().execute().data.length, 1);
    });
  });

  it('does not deduplicate by generated local email', async () => {
    await withService(async ({ db, service }) => {
      const firstId = await service.upsertCandidateRecord(
        candidate({
          candidate_id: 'first',
          email: null,
          raw_text: 'First unique resume body text that is long enough.',
        }),
        USER_ID,
      );
      const secondId = await service.upsertCandidateRecord(
        candidate({
          candidate_id: 'second',
          email: null,
          name: 'Second',
          raw_text: 'Second unique resume body text that is long enough.',
        }),
        USER_ID,
      );

      assert.notEqual(firstId, secondId);
      assert.equal(candidateRow(db, firstId)?.email, 'first@recruitai.local');
      assert.equal(candidateRow(db, secondId)?.email, 'second@recruitai.local');
    });
  });

  it('scopes deduplication to the tenant', async () => {
    await withService(async ({ db, service }) => {
      await service.upsertCandidateRecord(candidate(), USER_ID);
      await service.upsertCandidateRecord(candidate(), OTHER_USER);
      assert.equal(db.table('candidates').select().execute().data.length, 2);
    });
  });

  it('rejects a non-UUID user id', async () => {
    await withService(async ({ service }) => {
      await assert.rejects(
        service.upsertCandidateRecord(candidate(), 'not-a-uuid'),
        UnauthorizedError,
      );
    });
  });
});

describe('saveJobDescription', () => {
  it('inserts the job, binds the session and scores existing session candidates', async () => {
    await withService(async ({ db, store, service }) => {
      await store.insertSession({ id: SESSION, userId: USER_ID, title: 'New Hiring Campaign' });

      const linkedId = await service.ingestCandidateObject(candidate(), USER_ID, SESSION);
      await service.ingestCandidateObject(
        candidate({
          candidate_id: 'unrelated',
          name: 'Unrelated Person',
          email: 'other@example.com',
          raw_text: 'An unrelated resume body that is definitely long enough to hash uniquely.',
        }),
        USER_ID,
      );

      const jobId = await service.saveJobDescription(jobDescription(), USER_ID, {
        rawText: 'Raw JD text',
        sessionId: SESSION,
      });

      const job = db.table('jobs').select().eq('id', jobId).execute().data[0];
      assert.equal(job?.title, 'Senior Engineer');
      assert.equal(job?.raw_jd, 'Raw JD text');
      assert.equal(job?.status, 'active');
      assert.deepEqual((job?.jd_structured as Record<string, unknown>).role, 'Senior Engineer');

      const session = db.table('chat_sessions').select().eq('id', SESSION).execute().data[0];
      assert.equal(session?.job_id, jobId);
      assert.equal(session?.title, 'Hiring: Senior Engineer');

      const applications = db.table('applications').select().execute().data;
      assert.equal(applications.length, 1);
      assert.equal(applications[0]?.candidate_id, linkedId.candidate_id);
      assert.equal(applications[0]?.job_id, jobId);
      assert.equal(applications[0]?.status, 'new');
      assert.ok(Number(applications[0]?.match_score) > 0);
      assert.ok(
        Array.isArray((applications[0]?.match_reasoning as Record<string, unknown>).red_flags),
      );

      const metadata = candidateRow(db, linkedId.candidate_id)?.metadata as Record<string, unknown>;
      assert.equal(metadata.match_score, Number(applications[0]?.match_score));
      // Python renders matched labels with `.title()`.
      assert.deepEqual(metadata.matched_skills, ['Python', 'Typescript']);
    });
  });

  it('inserts a new job each call, matching Python', async () => {
    await withService(async ({ db, service }) => {
      const first = await service.saveJobDescription(jobDescription(), USER_ID);
      const second = await service.saveJobDescription(jobDescription(), USER_ID);
      assert.notEqual(first, second);
      assert.equal(db.table('jobs').select().execute().data.length, 2);
    });
  });

  it('still returns the generated id when the insert fails', async () => {
    await withService(async ({ store }) => {
      const failing: WorkspaceStore = {
        ...store,
        insertJob: async () => {
          throw new Error('database down');
        },
      };
      const isolated = new IngestionService({
        config: config(),
        store: failing,
        embedTexts: async (texts) => texts.map(() => [0.1, 0.2]),
      });
      const jobId = await isolated.saveJobDescription(jobDescription(), USER_ID);
      assert.match(jobId, /^[0-9a-f-]{36}$/);
    });
  });
});

describe('ingestCandidateObject', () => {
  it('scores against the session JD and persists chunks', async () => {
    await withService(async ({ db, store, service }) => {
      await store.insertSession({ id: SESSION, userId: USER_ID, title: 'New Hiring Campaign' });
      const jobId = await service.saveJobDescription(jobDescription(), USER_ID, {
        sessionId: SESSION,
      });

      const ingested = await service.ingestCandidateObject(candidate(), USER_ID, SESSION);

      assert.match(ingested.candidate_id, /^[0-9a-f-]{36}$/);
      assert.ok((ingested.match_score ?? 0) > 0);
      // Python renders matched labels with `.title()`.
      assert.deepEqual(ingested.matched_skills, ['Python', 'Typescript']);

      const application = db
        .table('applications')
        .select()
        .eq('candidate_id', ingested.candidate_id)
        .execute().data[0];
      assert.equal(application?.job_id, jobId);
      assert.equal(application?.status, 'new');
      assert.equal(application?.match_score, ingested.match_score);

      const metadata = candidateRow(db, ingested.candidate_id)?.metadata as Record<string, unknown>;
      assert.equal(metadata.match_score, ingested.match_score);
      assert.deepEqual(metadata.matched_skills, ingested.matched_skills);

      const chunks = db
        .table('resume_chunks')
        .select()
        .eq('candidate_id', ingested.candidate_id)
        .execute().data;
      assert.ok(chunks.length > 0);
      assert.equal(chunks[0]?.user_id, USER_ID);
      assert.equal(chunks[0]?.chunk_index, 0);
      assert.ok(Array.isArray(chunks[0]?.embedding));
      assert.match(String(chunks[0]?.chunk_text), /Ada Lovelace/);
    });
  });

  it('replaces existing chunks on re-ingestion', async () => {
    await withService(async ({ db, service }) => {
      const first = await service.ingestCandidateObject(candidate(), USER_ID);
      const before = db
        .table('resume_chunks')
        .select()
        .eq('candidate_id', first.candidate_id)
        .execute().data.length;

      await service.ingestCandidateObject(candidate({ name: 'Ada Again' }), USER_ID);
      const after = db
        .table('resume_chunks')
        .select()
        .eq('candidate_id', first.candidate_id)
        .execute().data.length;
      assert.equal(after, before);
    });
  });

  it('skips chunks for empty resume text', async () => {
    await withService(async ({ db, service }) => {
      const ingested = await service.ingestCandidateObject(
        candidate({ raw_text: '', skills: [] }),
        USER_ID,
      );
      assert.equal(
        db.table('resume_chunks').select().eq('candidate_id', ingested.candidate_id).execute().data
          .length,
        0,
      );
    });
  });

  it('maps the local dev marker to the configured UUID', async () => {
    await withService(async ({ db, service }) => {
      const ingested = await service.ingestCandidateObject(candidate(), 'local_dev_user_123');
      assert.equal(candidateRow(db, ingested.candidate_id)?.user_id, USER_ID);
    });
  });

  it('parses and ingests raw candidate text', async () => {
    await withService(async ({ db, service }) => {
      const ingested = await service.ingestSingleCandidateText(
        '33333333-3333-4333-8333-333333333333',
        'Grace Hopper',
        'Grace Hopper is a compiler pioneer with COBOL and systems programming experience.',
        USER_ID,
      );
      assert.match(ingested.candidate_id, /^[0-9a-f-]{36}$/);
      assert.equal(ingested.name, 'Grace Hopper');
      assert.ok(db.table('candidates').select().execute().data.length === 1);
    });
  });
});
