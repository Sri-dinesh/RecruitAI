import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { getConfig, type AppConfig } from '../config/index.js';
import { loadEnvFileIfPresent } from '../config/env.js';
import { closeDatabase } from '../db/client.js';
import { closeFallbackDatabase } from '../db/fallback.js';
import {
  createWorkspaceQueryStore,
  type WorkspaceQueryStore,
} from '../db/workspace-query-store.js';
import { createRetentionScheduler } from '../jobs/retention-scheduler.js';
import { createLogger } from '../telemetry/logger.js';

/**
 * Operational retention CLI (`npm run retention:run`).
 *
 * Python has no equivalent command: retention ran only through an
 * authenticated HTTP route. The CLI is the manual operational path for the
 * Node backend, while `RetentionScheduler` covers the recurring path. Both
 * call the same tenant-scoped service logic, so behavior cannot drift.
 *
 * Safety defaults:
 * - Every sweep is tenant-scoped; without `--user-id` the CLI enumerates
 *   tenants and runs the scoped sweep per tenant.
 * - `--dry-run` counts the rows a real sweep would touch without mutating.
 * - TTLs default to the Python values (90/365) and can be overridden.
 */

export const RETENTION_CLI_USAGE = `Usage: npm run retention:run -- [options]

Options:
  --user-id <uuid>             Restrict the sweep to one tenant
  --dry-run                    Count what would change without deleting
  --raw-resume-ttl-days <n>    Raw resume text TTL in days (default 90)
  --chat-ttl-days <n>          Chat message TTL in days (default 365)
  --help                       Show this help

Without --user-id every tenant is swept, one tenant at a time.`;

export interface RetentionCliOptions {
  readonly userId?: string;
  readonly dryRun: boolean;
  readonly rawResumeTtlDays?: number;
  readonly chatTtlDays?: number;
  readonly help: boolean;
}

export interface RetentionCliDependencies {
  readonly config?: AppConfig;
  readonly store?: WorkspaceQueryStore;
  readonly stdout?: (line: string) => void;
  readonly stderr?: (line: string) => void;
}

function parseTtl(name: string, raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${name} must be a non-negative integer, received "${raw}".`);
  }
  return Number(trimmed);
}

/** Parse CLI arguments; throws with a user-facing message on bad input. */
export function parseRetentionArgs(argv: readonly string[]): RetentionCliOptions {
  const parsed = parseArgs({
    args: [...argv],
    allowPositionals: false,
    strict: true,
    options: {
      'user-id': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'raw-resume-ttl-days': { type: 'string' },
      'chat-ttl-days': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  const values = parsed.values;
  const userId = values['user-id'];
  if (userId !== undefined && userId.trim() === '') {
    throw new Error('--user-id must not be empty.');
  }

  return {
    ...(userId === undefined ? {} : { userId }),
    dryRun: values['dry-run'] === true,
    ...(() => {
      const raw = parseTtl('--raw-resume-ttl-days', values['raw-resume-ttl-days']);
      return raw === undefined ? {} : { rawResumeTtlDays: raw };
    })(),
    ...(() => {
      const chat = parseTtl('--chat-ttl-days', values['chat-ttl-days']);
      return chat === undefined ? {} : { chatTtlDays: chat };
    })(),
    help: values.help === true,
  };
}

/**
 * Execute the CLI and return a process exit code.
 *
 * Kept dependency-injectable so tests can run against an isolated SQLite
 * store without touching process.env or the terminal.
 */
export async function runRetentionCli(
  argv: readonly string[] = process.argv.slice(2),
  dependencies: RetentionCliDependencies = {},
): Promise<number> {
  const stdout = dependencies.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const stderr = dependencies.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));

  let options: RetentionCliOptions;
  try {
    options = parseRetentionArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Error: ${message}`);
    stderr(RETENTION_CLI_USAGE);
    return 2;
  }

  if (options.help) {
    stdout(RETENTION_CLI_USAGE);
    return 0;
  }

  const ownsStore = dependencies.store === undefined;
  let config: AppConfig;
  try {
    if (dependencies.config !== undefined) {
      config = dependencies.config;
    } else {
      loadEnvFileIfPresent();
      config = getConfig();
    }
  } catch (error) {
    stderr(
      `Error: invalid configuration: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }

  // Keep machine-readable stdout clean: operational logs go to stderr.
  const logger = createLogger({
    name: 'recruitai.retention_cli',
    sink: (line) => stderr(line),
  });

  try {
    const store = dependencies.store ?? createWorkspaceQueryStore({ config });
    const scheduler = createRetentionScheduler({ config, queryStore: store, logger });
    const result = await scheduler.runOnce({
      ...(options.userId === undefined ? {} : { userId: options.userId }),
      dryRun: options.dryRun,
    });

    stdout(
      JSON.stringify(
        {
          ...result,
          raw_resume_ttl_days: options.rawResumeTtlDays ?? config.retention.rawResumeTtlDays,
          chat_ttl_days: options.chatTtlDays ?? config.retention.chatTtlDays,
        },
        null,
        2,
      ),
    );

    return result.tenants_failed > 0 ? 1 : 0;
  } catch (error) {
    stderr(
      `Error: retention run failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  } finally {
    if (ownsStore) {
      await closeDatabase();
      closeFallbackDatabase();
    }
  }
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void runRetentionCli().then((code) => {
    process.exitCode = code;
  });
}
