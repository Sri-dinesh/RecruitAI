import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');

console.log('====================================================');
console.log('       RecruitAI Verification Test Runner          ');
console.log('====================================================\n');

const testSuiteList = [
  { name: 'Feature 1: Chat UI Relocation', script: path.join(frontendDir, 'tests', 'chat-ui-relocation.test.mjs') },
  { name: 'Feature 2: Landing Page Creation', script: path.join(frontendDir, 'tests', 'landing-page.test.mjs') },
  { name: 'Feature 3: Next.js Build Integrity', script: path.join(frontendDir, 'scripts', 'verify-build.mjs') }
];

const skipBuild = process.argv.includes('--skip-build');
const resultsSummary = [];
let overallFailed = false;

for (const suite of testSuiteList) {
  if (skipBuild && suite.name.includes('Build Integrity')) {
    console.log(`\n⏩ Skipping ${suite.name} (--skip-build flag present)`);
    resultsSummary.push({ name: suite.name, status: 'SKIPPED' });
    continue;
  }

  console.log(`\n▶ Running ${suite.name}...`);
  const res = spawnSync('node', [suite.script], {
    cwd: frontendDir,
    encoding: 'utf8',
    stdio: 'inherit'
  });

  if (res.status === 0) {
    resultsSummary.push({ name: suite.name, status: 'PASSED' });
  } else {
    resultsSummary.push({ name: suite.name, status: 'FAILED' });
    overallFailed = true;
  }
}

console.log('\n====================================================');
console.log('               TEST SUMMARY REPORT                  ');
console.log('====================================================');
resultsSummary.forEach(item => {
  const badge = item.status === 'PASSED' ? '✅ PASS' : (item.status === 'SKIPPED' ? '⏩ SKIP' : '❌ FAIL');
  console.log(`${badge} | ${item.name}`);
});
console.log('====================================================\n');

if (overallFailed) {
  console.error('Overall E2E Test Suite FAILED.');
  process.exit(1);
} else {
  console.log('Overall E2E Test Suite PASSED SUCCESSFULLY.');
  process.exit(0);
}
