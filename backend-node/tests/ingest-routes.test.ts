import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import request from 'supertest';

import { createApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config/index.js';
import { FallbackDatabase } from '../src/db/fallback.js';
import { createSqliteWorkspaceStore, type WorkspaceStore } from '../src/db/workspace-store.js';
import type { JobDescription } from '../src/schemas/jd.js';
import { IngestionService } from '../src/services/ingestion-service.js';
import { parseStructuredResume } from '../src/services/resume-parser.js';
import type { parseDocument } from '../src/services/document-parser.js';

const JWT_SECRET = 'test-secret-key-that-is-at-least-32-bytes-long';
const USER_ID = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';
const SESSION = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-14T10:00:00.000Z');
const OVERSIZE = 15 * 1024 * 1024 + 1;
const UNSUPPORTED = "Unsupported file format '.exe'. Supported formats: PDF, DOCX, TXT, PNG, JPG.";
const RESUME_TEXT =
  'Ada Lovelace is a senior engineer with deep Python, TypeScript and PostgreSQL experience. ' +
  'She has shipped distributed systems and mentored engineers for over eight years.';

function devConfig(): AppConfig {
  return loadConfig({
    USE_LOCAL_AUTH: 'true',
    LOCAL_DEV_USER_ID: USER_ID,
    GEMINI_API_KEY: '',
    GOOGLE_API_KEY: '',
  });
}

function jwtConfig(): AppConfig {
  return loadConfig({
    USE_LOCAL_AUTH: 'false',
    SUPABASE_JWT_SECRET: JWT_SECRET,
    GEMINI_API_KEY: '',
    GOOGLE_API_KEY: '',
  });
}

function jd(overrides: Partial<JobDescription> = {}): JobDescription {
  return {
    role: 'Senior Engineer',
    required_skills: ['Python', 'TypeScript'],
    experience_years: 5,
    raw_text: 'We are hiring a Senior Engineer.',
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

interface HarnessOptions {
  readonly config?: AppConfig;
  readonly parseDocumentImpl?: typeof parseDocument;
  readonly parseJdImpl?: (rawText: string, filename: string) => Promise<JobDescription>;
}

interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly db: FallbackDatabase;
  readonly store: WorkspaceStore;
  readonly service: IngestionService;
  readonly config: AppConfig;
}

async function withApp<T>(
  fn: (harness: Harness) => Promise<T> | T,
  options: HarnessOptions = {},
): Promise<T> {
  const config = options.config ?? devConfig();
  const db = new FallbackDatabase(':memory:', config);
  try {
    const store = createSqliteWorkspaceStore(db);
    const service = new IngestionService({
      config,
      store,
      embedTexts: async (texts) => texts.map((_, index) => [index + 1, 1]),
      parseDocumentImpl:
        options.parseDocumentImpl ??
        (async (input) => (typeof input === 'string' ? input : input.toString('utf8'))),
      parseResumeImpl: (rawText, filename) => parseStructuredResume(rawText, filename),
      parseJdImpl: options.parseJdImpl ?? (async (rawText) => jd({ raw_text: rawText })),
      now: () => NOW,
    });
    const app = createApp({ config, ingestionService: service });
    return await fn({ app, db, store, service, config });
  } finally {
    db.close();
  }
}

function attachResume(
  req: request.Test,
  filename: string,
  content: string | Buffer = RESUME_TEXT,
  contentType = 'text/plain',
): request.Test {
  return req.attach('files', Buffer.from(content), { filename, contentType });
}

describe('POST /api/ingest/upload', () => {
  it('requires authentication when local auth is disabled', async () => {
    await withApp(
      async ({ app }) => {
        const response = await request(app).post('/api/ingest/upload').expect(401);
        assert.deepEqual(response.body, {
          detail: 'Authentication required. Please log in to continue.',
        });
        assert.equal(response.headers['www-authenticate'], 'Bearer');
      },
      { config: jwtConfig() },
    );
  });

  it('rejects a request with no files', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app).post('/api/ingest/upload').expect(400);
      assert.deepEqual(response.body, { detail: 'No resume files were provided.' });
    });
  });

  it('ingests a single txt resume and returns the Python result shape', async () => {
    await withApp(async ({ app, db }) => {
      const response = await attachResume(
        request(app).post('/api/ingest/upload'),
        'ada.txt',
        RESUME_TEXT,
      ).expect(200);

      assert.ok(Array.isArray(response.body));
      assert.equal(response.body.length, 1);
      const item = response.body[0] as Record<string, unknown>;
      assert.equal(item.filename, 'ada.txt');
      assert.equal(item.status, 'success');
      assert.match(String(item.candidate_id), /^[0-9a-f-]{36}$/);
      assert.equal(item.name, 'Ada');
      assert.equal(item.email, null);
      assert.equal(item.raw_text, RESUME_TEXT);
      assert.equal(item.source, 'direct_upload');

      const rows = db.table('candidates').select().execute().data;
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.user_id, USER_ID);
      assert.equal((rows[0]?.metadata as Record<string, unknown>).consent_at, NOW.toISOString());

      const chunks = db.table('resume_chunks').select().execute().data;
      assert.ok(chunks.length > 0);
    });
  });

  it('accepts a single file through the `file` field', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/ingest/upload')
        .attach('file', Buffer.from(RESUME_TEXT), {
          filename: 'ada.txt',
          contentType: 'text/plain',
        })
        .expect(200);

      assert.equal(response.body.length, 1);
      assert.equal(response.body[0].filename, 'ada.txt');
    });
  });

  it('combines `files` then `file`, in that order', async () => {
    await withApp(async ({ app }) => {
      const req = request(app).post('/api/ingest/upload');
      const second =
        'Grace Hopper is a compiler pioneer with COBOL and systems programming experience ' +
        'spanning several decades of hardware and software research.';
      attachResume(req, 'first.txt');
      req.attach('file', Buffer.from(second), {
        filename: 'second.txt',
        contentType: 'text/plain',
      });

      const response = await req.expect(200);
      assert.equal(response.body.length, 2);
      assert.equal(response.body[0].filename, 'first.txt');
      assert.equal(response.body[1].filename, 'second.txt');
    });
  });

  it('returns a plain 400 for a single unsupported file', async () => {
    await withApp(async ({ app }) => {
      const response = await attachResume(
        request(app).post('/api/ingest/upload'),
        'malware.exe',
        Buffer.from('MZ'),
        'application/octet-stream',
      ).expect(400);
      assert.deepEqual(response.body, { detail: UNSUPPORTED });
    });
  });

  it('returns 207 with per-file results for a mixed batch', async () => {
    await withApp(async ({ app, db }) => {
      const req = request(app).post('/api/ingest/upload');
      attachResume(req, 'ada.txt');
      req.attach('files', Buffer.from('MZ'), {
        filename: 'malware.exe',
        contentType: 'application/octet-stream',
      });

      const response = await req.expect(207);
      assert.equal(response.body.length, 2);
      assert.equal(response.body[0].status, 'success');
      assert.equal(response.body[0].filename, 'ada.txt');
      assert.deepEqual(response.body[1], {
        filename: 'malware.exe',
        status: 'failed',
        error: UNSUPPORTED,
      });
      assert.equal(db.table('candidates').select().execute().data.length, 1);
    });
  });

  it('returns 207 when one resume has no readable text', async () => {
    await withApp(async ({ app }) => {
      const req = request(app).post('/api/ingest/upload');
      attachResume(req, 'ada.txt');
      attachResume(req, 'blank.txt', '   ', 'text/plain');

      const response = await req.expect(207);
      assert.deepEqual(response.body[1], {
        filename: 'blank.txt',
        status: 'failed',
        error: 'No readable text could be extracted from the file.',
      });
    });
  });

  it('rejects a single resume larger than 15 MB with the Python message', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/ingest/upload')
        .attach('files', Buffer.alloc(OVERSIZE), {
          filename: 'big.txt',
          contentType: 'text/plain',
        })
        .expect(400);

      assert.deepEqual(response.body, {
        detail: "File 'big.txt' exceeds maximum allowed size of 15 MB.",
      });
    });
  });

  it('links the candidate to the campaign session', async () => {
    await withApp(async ({ app, db, store }) => {
      await store.insertSession({ id: SESSION, userId: USER_ID, title: 'Campaign' });

      const response = await request(app)
        .post('/api/ingest/upload')
        .field('session_id', SESSION)
        .attach('files', Buffer.from(RESUME_TEXT), {
          filename: 'ada.txt',
          contentType: 'text/plain',
        })
        .expect(200);

      const candidateId = String(response.body[0].candidate_id);
      const row = db.table('candidates').select().eq('id', candidateId).execute().data[0];
      const metadata = row?.metadata as Record<string, unknown>;
      assert.equal(metadata.session_id, SESSION);
      assert.deepEqual(metadata.session_ids, [SESSION]);

      const links = db.table('session_candidates').select().execute().data;
      assert.equal(links.length, 1);
      assert.equal(links[0]?.session_id, SESSION);
      assert.equal(links[0]?.candidate_id, candidateId);
    });
  });
});

describe('POST /api/ingest/upload-jd', () => {
  it('requires authentication when local auth is disabled', async () => {
    await withApp(
      async ({ app }) => {
        await request(app).post('/api/ingest/upload-jd').expect(401);
      },
      { config: jwtConfig() },
    );
  });

  it('returns a 422 when the file field is missing', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app).post('/api/ingest/upload-jd').expect(422);
      assert.deepEqual(response.body, {
        detail: [{ type: 'missing', loc: ['body', 'file'], msg: 'Field required', input: null }],
      });
    });
  });

  it('rejects an unsupported format with 400', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/ingest/upload-jd')
        .attach('file', Buffer.from('MZ'), {
          filename: 'jd.exe',
          contentType: 'application/octet-stream',
        })
        .expect(400);
      assert.deepEqual(response.body, { detail: UNSUPPORTED });
    });
  });

  it('rejects a file larger than 15 MB with 413', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/ingest/upload-jd')
        .attach('file', Buffer.alloc(OVERSIZE), {
          filename: 'jd.txt',
          contentType: 'text/plain',
        })
        .expect(413);

      assert.deepEqual(response.body, {
        detail: "File 'jd.txt' exceeds maximum allowed size of 15 MB.",
      });
    });
  });

  it('maps document read failures to 400', async () => {
    await withApp(
      async ({ app }) => {
        const response = await request(app)
          .post('/api/ingest/upload-jd')
          .attach('file', Buffer.from('anything'), {
            filename: 'jd.txt',
            contentType: 'text/plain',
          })
          .expect(400);
        assert.deepEqual(response.body, { detail: 'Failed to read file content: unreadable' });
      },
      {
        parseDocumentImpl: async () => {
          throw new Error('unreadable');
        },
      },
    );
  });

  it('rejects an empty extracted JD with 400', async () => {
    await withApp(
      async ({ app }) => {
        const response = await request(app)
          .post('/api/ingest/upload-jd')
          .attach('file', Buffer.from('anything'), {
            filename: 'jd.txt',
            contentType: 'text/plain',
          })
          .expect(400);
        assert.deepEqual(response.body, { detail: 'The uploaded JD file is empty.' });
      },
      { parseDocumentImpl: async () => '   \n  ' },
    );
  });

  it('maps JD parse failures to 500', async () => {
    await withApp(
      async ({ app }) => {
        const response = await request(app)
          .post('/api/ingest/upload-jd')
          .attach('file', Buffer.from('JD text'), {
            filename: 'jd.txt',
            contentType: 'text/plain',
          })
          .expect(500);
        assert.deepEqual(response.body, { detail: 'Failed to parse JD: bad jd' });
      },
      {
        parseJdImpl: async () => {
          throw new Error('bad jd');
        },
      },
    );
  });

  it('parses, persists and binds the JD to the session', async () => {
    await withApp(async ({ app, db, store }) => {
      await store.insertSession({ id: SESSION, userId: USER_ID, title: 'Campaign' });

      const response = await request(app)
        .post('/api/ingest/upload-jd')
        .field('session_id', SESSION)
        .attach('file', Buffer.from('We are hiring a Senior Engineer.'), {
          filename: 'jd.txt',
          contentType: 'text/plain',
        })
        .expect(200);

      assert.deepEqual(response.body, jd());

      const jobs = db.table('jobs').select().execute().data;
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0]?.user_id, USER_ID);
      assert.equal(jobs[0]?.title, 'Senior Engineer');
      assert.equal(jobs[0]?.raw_jd, 'We are hiring a Senior Engineer.');
      assert.equal(jobs[0]?.status, 'active');

      const session = db.table('chat_sessions').select().eq('id', SESSION).execute().data[0];
      assert.equal(session?.job_id, jobs[0]?.id);
      assert.equal(session?.title, 'Hiring: Senior Engineer');
    });
  });

  it('persists the JD without binding when no session is provided', async () => {
    await withApp(async ({ app, db }) => {
      await request(app)
        .post('/api/ingest/upload-jd')
        .attach('file', Buffer.from('We are hiring a Senior Engineer.'), {
          filename: 'jd.txt',
          contentType: 'text/plain',
        })
        .expect(200);

      assert.equal(db.table('jobs').select().execute().data.length, 1);
      assert.equal(db.table('chat_sessions').select().execute().data.length, 0);
    });
  });
});
