import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');

console.log('\n=== Feature 3: Next.js Build Integrity Verification ===');
console.log(`Executing 'npm run build' inside ${frontendDir}...`);

const buildResult = spawnSync('npm', ['run', 'build'], {
  cwd: frontendDir,
  encoding: 'utf8',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
});

const stdout = buildResult.stdout || '';
const stderr = buildResult.stderr || '';
const combinedOutput = stdout + '\n' + stderr;

console.log('--- Build Process Output ---');
console.log(combinedOutput);
console.log('----------------------------');

const exitCode = buildResult.status;
const hasTsErrors = /Failed to compile|TypeScript error|TS\d+/i.test(combinedOutput);
const hasEslintErrors = /ESLint Error|Failed to lint/i.test(combinedOutput);

let failed = false;

if (exitCode !== 0) {
  console.error(`❌ FAIL: 'npm run build' exited with code ${exitCode}`);
  failed = true;
} else {
  console.log("✅ PASS: 'npm run build' exited with code 0");
}

if (hasTsErrors) {
  console.error('❌ FAIL: Build output contains TypeScript errors');
  failed = true;
} else {
  console.log('✅ PASS: No TypeScript compilation errors found');
}

if (hasEslintErrors) {
  console.error('❌ FAIL: Build output contains ESLint errors');
  failed = true;
} else {
  console.log('✅ PASS: No ESLint errors found');
}

if (failed) {
  console.error('\nBuild verification FAILED.');
  process.exit(1);
} else {
  console.log('\nAll Next.js Build Integrity tests PASSED successfully.');
  process.exit(0);
}
