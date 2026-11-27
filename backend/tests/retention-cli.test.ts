import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseRetentionArgs, RETENTION_CLI_USAGE, runRetentionCli } from '../src/cli/retention.js';
import {
  CANDIDATE_ONE,
  USER_ID,
  daysAgo,
  devConfig,
  seedCandidate,
  seedChatMessage,
  seedSession,
  SESSION_ONE,
  withPhase15,
} from './phase15-helpers.js';

describe('retention CLI argument parsing', () => {
  it('uses safe defaults', () => {
    assert.deepEqual(parseRetentionArgs([]), { dryRun: false, help: false });
  });

  it('parses every supported option', () => {
    const options = parseRetentionArgs([
      '--user-id',
      USER_ID,
      '--dry-run',
      '--raw-resume-ttl-days',
      '30',
      '--chat-ttl-days',
      '0',
    ]);
    assert.deepEqual(options, {
      userId: USER_ID,
      dryRun: true,
      rawResumeTtlDays: 30,
      chatTtlDays: 0,
      help: false,
    });
  });

  it('rejects invalid TTL values and unknown flags', () => {
    assert.throws(() => parseRetentionArgs(['--chat-ttl-days=-1']), /non-negative integer/);
    assert.throws(() => parseRetentionArgs(['--raw-resume-ttl-days', 'soon']), /non-negative/);
    assert.throws(() => parseRetentionArgs(['--user-id', '  ']), /must not be empty/);
    assert.throws(() => parseRetentionArgs(['--nope']));
    assert.throws(() => parseRetentionArgs(['positional']));
  });
});

describe('retention CLI', () => {
  it('prints usage for --help without opening a store', async () => {
    let output = '';
    const code = await runRetentionCli(['--help'], {
      stdout: (line) => {
        output += line;
      },
    });
    assert.equal(code, 0);
    assert.equal(output, RETENTION_CLI_USAGE);
  });

  it('returns exit code 2 for invalid arguments', async () => {
    let errors = '';
    const code = await runRetentionCli(['--chat-ttl-days', 'x'], {
      stderr: (line) => {
        errors += `${line}\n`;
      },
    });
    assert.equal(code, 2);
    assert.match(errors, /non-negative integer/);
    assert.match(errors, /Usage: npm run retention:run/);
  });

  it('runs a dry run and emits machine-readable JSON', async () => {
    await withPhase15(async ({ db, store }) => {
      seedSession(db, { id: SESSION_ONE });
      seedCandidate(db, { id: CANDIDATE_ONE, createdAt: daysAgo(200) });
      seedChatMessage(db, {
        id: 'old-message',
        sessionId: SESSION_ONE,
        content: 'old',
        createdAt: daysAgo(400),
      });

      const lines: string[] = [];
      const code = await runRetentionCli(['--dry-run', '--user-id', USER_ID], {
        config: devConfig(),
        store,
        stdout: (line) => lines.push(line),
        stderr: () => {},
      });

      assert.equal(code, 0);
      const payload = JSON.parse(lines.join('\n')) as Record<string, unknown>;
      assert.equal(payload['status'], 'completed');
      assert.equal(payload['dry_run'], true);
      assert.equal(payload['tenant_scoped'], true);
      assert.deepEqual(payload['summary'], { raw_resumes_cleared: 1, chat_messages_purged: 1 });
      assert.equal(payload['raw_resume_ttl_days'], 90);
      assert.equal(payload['chat_ttl_days'], 365);

      // Dry run must not delete anything.
      assert.equal(
        db.table('chat_messages').select().eq('id', 'old-message').execute().data.length,
        1,
      );
    });
  });

  it('applies a real tenant-scoped sweep with TTL overrides', async () => {
    await withPhase15(async ({ db, store }) => {
      seedSession(db, { id: SESSION_ONE });
      seedCandidate(db, { id: CANDIDATE_ONE, createdAt: daysAgo(200) });

      const lines: string[] = [];
      const code = await runRetentionCli(
        ['--user-id', USER_ID, '--raw-resume-ttl-days', '10', '--chat-ttl-days', '10'],
        {
          config: devConfig(),
          store,
          stdout: (line) => lines.push(line),
          stderr: () => {},
        },
      );

      assert.equal(code, 0);
      const payload = JSON.parse(lines.join('\n')) as Record<string, unknown>;
      assert.deepEqual(payload['summary'], { raw_resumes_cleared: 1, chat_messages_purged: 0 });
      assert.equal(
        db.table('candidates').select().eq('id', CANDIDATE_ONE).execute().data[0]?.raw_resume_text,
        null,
      );
    });
  });
});
