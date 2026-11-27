import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { createLogger, getDefaultLogLevel, setDefaultLogLevel } from '../src/telemetry/logger.js';

/**
 * Phase 19 log-level tests.
 *
 * `LOG_LEVEL` is read after module-level loggers already exist, so the default
 * must be resolved per emit rather than captured at construction time.
 */

after(() => {
  setDefaultLogLevel('info');
});

describe('default log level', () => {
  it('applies to loggers created before the level is set', () => {
    setDefaultLogLevel('info');
    const lines: string[] = [];
    const logger = createLogger({
      name: 'recruitai.test',
      sink: (line) => lines.push(line),
    });

    assert.equal(logger.level, 'info');
    logger.debug('hidden by info');
    logger.info('shown by info');
    assert.equal(lines.length, 1);

    setDefaultLogLevel('warn');
    assert.equal(logger.level, 'warn');
    logger.info('now hidden');
    logger.warn('now shown');
    assert.equal(lines.length, 2);
    assert.match(lines[1] ?? '', /"level":"warn"/);
  });

  it('lets an explicit per-logger level win over the default', () => {
    setDefaultLogLevel('error');
    const lines: string[] = [];
    const logger = createLogger({
      name: 'recruitai.test',
      level: 'debug',
      sink: (line) => lines.push(line),
    });

    logger.debug('explicit debug survives');
    assert.equal(logger.level, 'debug');
    assert.equal(lines.length, 1);
  });

  it('exposes the active default for diagnostics', () => {
    setDefaultLogLevel('error');
    assert.equal(getDefaultLogLevel(), 'error');
  });
});
