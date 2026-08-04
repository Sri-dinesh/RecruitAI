import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function runLandingPageTests() {
  const results = [];
  const targetFile = path.join(projectRoot, 'src', 'app', 'page.tsx');

  // Test 1: Verify frontend/src/app/page.tsx exists
  const exists = fs.existsSync(targetFile);
  results.push({
    name: 'Landing page file exists at frontend/src/app/page.tsx',
    passed: exists,
    detail: exists ? `File found at ${targetFile}` : `File not found at ${targetFile}`
  });

  if (!exists) {
    return results;
  }

  const content = fs.readFileSync(targetFile, 'utf8');

  // Test 2: Verify Headline element/text
  const hasHeadline = /RecruitAI|<h1[\s\S]*?>[\s\S]*?<\/h1>/i.test(content);
  results.push({
    name: "Landing page contains a main Headline",
    passed: hasHeadline,
    detail: hasHeadline ? "Headline element / RecruitAI heading detected" : "Headline element missing"
  });

  // Test 3: Verify Subheadline element/text
  const hasSubheadline = /<p[\s\S]*?>[\s\S]*?<\/p>|subheadline|subtitle|tagline/i.test(content);
  results.push({
    name: "Landing page contains a Subheadline",
    passed: hasSubheadline,
    detail: hasSubheadline ? "Subheadline paragraph/description detected" : "Subheadline missing"
  });

  // Test 4: Verify distinct Login and Signup buttons
  const hasLoginButton = /Login/i.test(content);
  const hasSignupButton = /Sign\s*up|Register/i.test(content);
  const hasDistinctButtons = hasLoginButton && hasSignupButton;
  results.push({
    name: "Landing page contains distinct 'Login' and 'Signup' buttons",
    passed: hasDistinctButtons,
    detail: hasDistinctButtons 
      ? "Both 'Login' and 'Signup' buttons detected" 
      : `Login present: ${hasLoginButton}, Signup present: ${hasSignupButton}`
  });

  // Test 5: Verify Feature Cards grid/components
  const hasFeatureCards = /feature|grid|card|ATS|Candidate|Interview|Email/i.test(content);
  results.push({
    name: "Landing page contains Feature Cards grid",
    passed: hasFeatureCards,
    detail: hasFeatureCards ? "Feature cards section/content detected" : "Feature cards section missing"
  });

  // Test 6: Verify CTA linking to /dashboard
  const hasDashboardCta = /href=['"]\/dashboard['"]|router\.push\(['"]\/dashboard['"]\)|Link[\s\S]*?\/dashboard/i.test(content);
  results.push({
    name: "Landing page contains CTA linking to /dashboard",
    passed: hasDashboardCta,
    detail: hasDashboardCta ? "CTA link/navigation to /dashboard detected" : "CTA link to /dashboard missing"
  });

  return results;
}

const testResults = runLandingPageTests();
console.log('\n=== Feature 2: Landing Page Verification ===');
let failed = false;
testResults.forEach(res => {
  const status = res.passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${res.name}`);
  if (!res.passed) {
    console.log(`   Detail: ${res.detail}`);
    failed = true;
  }
});

if (failed) {
  process.exit(1);
} else {
  console.log('All Landing Page tests PASSED successfully.');
}
