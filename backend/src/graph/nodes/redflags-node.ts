import { detectRedFlags } from '../../services/mismatch-analyzer.js';
import { historyOf, resumesOf } from '../state.js';
import type { RecruitState } from '../state.js';

/**
 * Port of `backend/app/graph/nodes/redflags_node.py`.
 *
 * Runs LLM red-flag detection for every loaded candidate and renders one
 * report. Python fans out across a ThreadPoolExecutor; `Promise.all` gives the
 * same bounded-concurrency behaviour for these I/O-bound calls.
 */

interface FlagResult {
  readonly name: string;
  readonly flags: string[];
}

export async function redflagsNode(state: RecruitState): Promise<Partial<RecruitState>> {
  const history = historyOf(state);
  const resumes = resumesOf(state);

  if (resumes.length === 0) {
    return {
      conversation_history: [
        ...history,
        {
          role: 'assistant',
          content:
            'No resumes loaded yet. Please load candidate resumes before running ' +
            'the red-flag detection.',
        },
      ],
    };
  }

  const results: FlagResult[] = await Promise.all(
    resumes.map(async (candidate) => {
      try {
        return { name: candidate.name, flags: await detectRedFlags(candidate) };
      } catch (error) {
        return {
          name: candidate.name,
          flags: [
            `Could not analyze due to error: ${error instanceof Error ? error.message : String(error)}`,
          ],
        };
      }
    }),
  );

  const reportLines: string[] = [
    '### 🔍 Resume Red-Flag Detection Report\n',
    `Analyzed **${resumes.length}** candidate(s) for timeline gaps, ` +
      'inconsistencies, and suspicious patterns.\n',
    '---\n',
  ];

  for (const result of results) {
    reportLines.push(`#### 👤 ${result.name}`);

    if (result.flags.length > 0) {
      const flagCount = result.flags.filter((flag) => Boolean(flag)).length;
      reportLines.push(`**Status:** ⚠️ ${flagCount} potential issue(s) found\n`);
      for (const flag of result.flags) {
        reportLines.push(`  - ⚠️ ${flag}`);
      }
    } else {
      reportLines.push('**Status:** ✅ No red flags detected\n');
    }

    reportLines.push('');
  }

  reportLines.push('---');
  reportLines.push(
    '\n*Note: Red flags are LLM-generated suggestions. Always verify manually before action.*',
  );

  return {
    resumes,
    conversation_history: [...history, { role: 'assistant', content: reportLines.join('\n') }],
  };
}
