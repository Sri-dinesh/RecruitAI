import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import express from 'express';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';
import { CORS_ALLOWED_METHODS, CORS_MAX_AGE_SECONDS } from '../src/middleware/cors.js';
import { errorHandler, notFoundHandler } from '../src/middleware/error-handler.js';
import {
  MAX_RESUME_FILES_PER_BATCH,
  MAX_RESUME_FILE_SIZE_BYTES,
  resumeUpload,
} from '../src/middleware/upload.js';
import {
  DEFAULT_INSUFFICIENT_CREDITS_MESSAGE,
  ForbiddenError,
  InsufficientCreditsError,
  UnauthorizedError,
} from '../src/types/errors.js';

const config = loadConfig({});

function buildApp() {
  return createApp({ config });
}

/** Minimal app that exercises the terminal error middleware directly. */
function buildErrorApp() {
  const app = express();
  app.use(express.json());

  app.get('/quota', () => {
    throw new InsufficientCreditsError();
  });
  app.get('/unauthorized', () => {
    throw new UnauthorizedError();
  });
  app.get('/forbidden', () => {
    throw new ForbiddenError('nope');
  });
  app.get('/boom', () => {
    throw new Error('internal database password leaked');
  });
  app.get('/boom-async', async () => {
    throw new Error('async internal detail');
  });
  app.post('/echo', (req, res) => {
    res.json(req.body);
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function captureConsoleError() {
  const calls: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };
  return {
    calls,
    restore: () => {
      console.error = original;
    },
  };
}

describe('app wiring', () => {
  it('serves the root message', async () => {
    const response = await request(buildApp()).get('/').expect(200);
    assert.deepEqual(response.body, {
      message: 'RecruitAI backend API server is running successfully.',
    });
  });

  it('serves public liveness on /health and /api/health', async () => {
    for (const path of ['/health', '/api/health']) {
      const response = await request(buildApp()).get(path).expect(200);
      assert.equal(response.body.status, 'healthy');
      assert.equal(response.body.message, 'RecruitAI backend API server is operational.');
      assert.equal(response.body.version, '2.0.0');
      assert.equal(typeof response.body.uptime_seconds, 'number');
      assert.ok(!Number.isNaN(Date.parse(response.body.timestamp)));
    }
  });

  it('does not emit the Express fingerprint header', async () => {
    const response = await request(buildApp()).get('/health').expect(200);
    assert.equal(response.headers['x-powered-by'], undefined);
  });

  it('returns FastAPI-shaped JSON 404 for unknown routes', async () => {
    for (const path of ['/nope', '/api/does-not-exist']) {
      const response = await request(buildApp()).get(path).expect(404);
      assert.deepEqual(response.body, { detail: 'Not Found' });
    }
  });
});

describe('CORS', () => {
  it('allows configured origins and echoes them with credentials', async () => {
    for (const origin of ['https://recruitaiofficial.vercel.app', 'http://localhost:3000']) {
      const response = await request(buildApp()).get('/health').set('Origin', origin).expect(200);
      assert.equal(response.headers['access-control-allow-origin'], origin);
      assert.equal(response.headers['access-control-allow-credentials'], 'true');
      assert.match(response.headers['vary'] ?? '', /Origin/i);
    }
  });

  it('allows Vercel preview origins via the Python regex', async () => {
    const origin = 'https://recruitai-abc123.vercel.app';
    const response = await request(buildApp()).get('/health').set('Origin', origin).expect(200);
    assert.equal(response.headers['access-control-allow-origin'], origin);
  });

  it('does not add CORS headers for disallowed or missing origins', async () => {
    const disallowed = await request(buildApp())
      .get('/health')
      .set('Origin', 'https://evil.example')
      .expect(200);
    assert.equal(disallowed.headers['access-control-allow-origin'], undefined);

    const missing = await request(buildApp()).get('/health').expect(200);
    assert.equal(missing.headers['access-control-allow-origin'], undefined);
  });

  it('answers allowed preflights with Starlette status, methods and headers', async () => {
    const origin = 'https://recruitai.vercel.app';
    const response = await request(buildApp())
      .options('/api/chat')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(200);

    assert.equal(response.headers['access-control-allow-origin'], origin);
    assert.equal(response.headers['access-control-allow-methods'], CORS_ALLOWED_METHODS);
    assert.equal(response.headers['access-control-allow-headers'], 'authorization,content-type');
    assert.equal(response.headers['access-control-allow-credentials'], 'true');
    assert.equal(response.headers['access-control-max-age'], String(CORS_MAX_AGE_SECONDS));
  });

  it('does not allow preflights from disallowed origins', async () => {
    const response = await request(buildApp())
      .options('/api/chat')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');

    assert.equal(response.headers['access-control-allow-origin'], undefined);
  });

  it('honors an explicit ALLOWED_ORIGINS override', async () => {
    const custom = createApp({ config: loadConfig({ ALLOWED_ORIGINS: 'https://custom.example' }) });

    const allowed = await request(custom).get('/health').set('Origin', 'https://custom.example');
    assert.equal(allowed.headers['access-control-allow-origin'], 'https://custom.example');

    const replaced = await request(custom).get('/health').set('Origin', 'http://localhost:3000');
    assert.equal(replaced.headers['access-control-allow-origin'], undefined);
  });
});

describe('body parsing', () => {
  it('parses JSON request bodies', async () => {
    const response = await request(buildErrorApp())
      .post('/echo')
      .send({ hello: 'world', count: 2 })
      .expect(200);
    assert.deepEqual(response.body, { hello: 'world', count: 2 });
  });

  it('parses multipart uploads for ingest, including form fields', async () => {
    const app = express();
    app.post('/upload', resumeUpload, (req, res) => {
      const files = (req.files ?? []) as Express.Multer.File[];
      res.json({
        sessionId: (req.body as { session_id?: string }).session_id,
        files: files.map((file) => ({
          field: file.fieldname,
          name: file.originalname,
          size: file.size,
          text: file.buffer.toString(),
        })),
      });
    });

    const response = await request(app)
      .post('/upload')
      .field('session_id', 'sess-1')
      .attach('files', Buffer.from('first'), 'first.txt')
      .attach('file', Buffer.from('second'), 'second.txt')
      .expect(200);

    assert.equal(response.body.sessionId, 'sess-1');
    assert.deepEqual(response.body.files, [
      { field: 'files', name: 'first.txt', size: 5, text: 'first' },
      { field: 'file', name: 'second.txt', size: 6, text: 'second' },
    ]);
  });

  it('exposes the Python ingest limits', () => {
    assert.equal(MAX_RESUME_FILE_SIZE_BYTES, 15 * 1024 * 1024);
    assert.equal(MAX_RESUME_FILES_PER_BATCH, 10);
  });
});

describe('global error handling', () => {
  it('renders the 402 quota contract unchanged', async () => {
    const response = await request(buildErrorApp()).get('/quota').expect(402);
    assert.deepEqual(response.body, {
      detail: {
        error: 'INSUFFICIENT_CREDITS',
        message: DEFAULT_INSUFFICIENT_CREDITS_MESSAGE,
        upgrade_url: '/pricing',
      },
    });
  });

  it('renders known HTTP errors with status, detail and headers', async () => {
    const unauthorized = await request(buildErrorApp()).get('/unauthorized').expect(401);
    assert.deepEqual(unauthorized.body, {
      detail: 'Authentication required. Please log in to continue.',
    });
    assert.equal(unauthorized.headers['www-authenticate'], 'Bearer');

    const forbidden = await request(buildErrorApp()).get('/forbidden').expect(403);
    assert.deepEqual(forbidden.body, { detail: 'nope' });
  });

  it('returns an opaque 500 with a server-side reference for unknown errors', async () => {
    const capture = captureConsoleError();
    try {
      const response = await request(buildErrorApp()).get('/boom').expect(500);

      assert.equal(
        response.body.detail,
        `An unexpected server error occurred. (ref=${response.body.ref})`,
      );
      assert.match(response.body.ref, /^[0-9a-f]{8}$/);
      assert.ok(!JSON.stringify(response.body).includes('password'));

      assert.equal(capture.calls.length, 1);
      const record = JSON.parse(String(capture.calls[0]?.[0])) as Record<string, unknown>;
      assert.equal(record.level, 'error');
      assert.equal(record.logger, 'recruitai.server');
      assert.equal(record.ref, response.body.ref);
      assert.equal(record.method, 'GET');
      assert.equal(record.path, '/boom');
      assert.equal(record.error_type, 'Error');
      assert.match(
        String(record.message),
        new RegExp(`\\[UNHANDLED_EXCEPTION ref=${response.body.ref}\\] GET /boom: Error:`),
      );
      assert.match(String(record.message), /internal database password leaked/);
    } finally {
      capture.restore();
    }
  });

  it('also catches rejected async handlers', async () => {
    const capture = captureConsoleError();
    try {
      const response = await request(buildErrorApp()).get('/boom-async').expect(500);
      assert.match(
        response.body.detail,
        /^An unexpected server error occurred\. \(ref=[0-9a-f]{8}\)$/,
      );
      assert.ok(!JSON.stringify(response.body).includes('async internal detail'));
    } finally {
      capture.restore();
    }
  });
});
