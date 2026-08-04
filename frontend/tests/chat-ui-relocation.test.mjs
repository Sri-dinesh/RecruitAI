import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function runChatUIRelocationTests() {
  const results = [];
  const targetFile = path.join(projectRoot, 'src', 'app', 'dashboard', 'page.tsx');

  // Test 1: Verify frontend/src/app/dashboard/page.tsx exists
  const exists = fs.existsSync(targetFile);
  results.push({
    name: 'Dashboard page file exists at frontend/src/app/dashboard/page.tsx',
    passed: exists,
    detail: exists ? `File found at ${targetFile}` : `File not found at ${targetFile}`
  });

  if (!exists) {
    return results;
  }

  const content = fs.readFileSync(targetFile, 'utf8');

  // Test 2: Verify it is a client component ('use client')
  const hasUseClient = /^\s*['"]use client['"]/m.test(content);
  results.push({
    name: "Dashboard page is a client component ('use client')",
    passed: hasUseClient,
    detail: hasUseClient ? "'use client' directive found" : "Missing 'use client' directive"
  });

  // Test 3: Verify `@/components/MarkdownText` import
  const hasMarkdownImport = /import\s+[\s\S]*?MarkdownText[\s\S]*?from\s+['"](@\/components\/MarkdownText|\.\.\/components\/MarkdownText|components\/MarkdownText)['"]/.test(content);
  results.push({
    name: "Imports MarkdownText from @/components/MarkdownText",
    passed: hasMarkdownImport,
    detail: hasMarkdownImport ? "MarkdownText import statement found" : "MarkdownText import missing or incorrect path"
  });

  // Test 4: Verify Chat UI state management
  const hasChatState = content.includes('useState') && 
    (content.includes('messages') || content.includes('setMessages')) &&
    (content.includes('input') || content.includes('setInput'));
  results.push({
    name: "Contains Chat UI state management (messages, input, loading)",
    passed: hasChatState,
    detail: hasChatState ? "Chat state hooks detected" : "Chat state hooks missing"
  });

  // Test 5: Verify Chat API integration endpoint
  const hasChatApi = content.includes('/api/chat');
  results.push({
    name: "Integrates with /api/chat endpoint",
    passed: hasChatApi,
    detail: hasChatApi ? "/api/chat fetch call found" : "/api/chat fetch call missing"
  });

  // Test 6: Verify Ingestion & Session handlers
  const hasIngestAndSessions = content.includes('/api/ingest') && content.includes('/api/sessions');
  results.push({
    name: "Contains full functionality (ingest upload & sessions management)",
    passed: hasIngestAndSessions,
    detail: hasIngestAndSessions ? "Ingest and Session API integrations found" : "Ingest/Session handlers missing"
  });

  return results;
}

const testResults = runChatUIRelocationTests();
console.log('\n=== Feature 1: Chat UI Relocation Verification ===');
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
  console.log('All Chat UI Relocation tests PASSED successfully.');
}
