import { pathToFileURL } from 'node:url';

import { loadEnvFileIfPresent } from '../config/env.js';
import { runPreflightCli } from '../config/preflight.js';

/**
 * Production preflight CLI (`npm run preflight`).
 *
 * Run this with the deployment's real environment before starting or switching
 * traffic. It prints one line per check, never prints secret values, and exits
 * non-zero when any check fails.
 *
 * In a container, run the compiled equivalent:
 *   node dist/cli/preflight.js
 */

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  // Local runs may rely on backend/.env; deployed environments provide
  // variables directly, and process.env always wins over the file.
  loadEnvFileIfPresent();
  process.exitCode = runPreflightCli();
}
