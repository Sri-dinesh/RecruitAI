import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import {
  analyzeExperienceMismatch,
  suggestJdImprovements,
} from '../../services/mismatch-analyzer.js';
import { getGraphDeps, type GraphDeps } from '../deps.js';
import { historyOf } from '../state.js';
import type { RecruitState } from '../state.js';

/**
 * Port of `backend/app/graph/nodes/parse_jd_node.py`.
 *
 * Resolves JD/resume paths from the user message (with Python's fallbacks),
 * parses the JD, ingests every resume in the target folder, then reports the
 * experience-mismatch diagnostic and JD improvement suggestions.
 */

const DEFAULT_RESUME_DIR = 'backend/data/resumes';

function firstExistingPath(candidate: string): string | null {
  if (!candidate) {
    return null;
  }
  if (existsSync(candidate)) {
    return candidate;
  }
  if (isAbsolute(candidate)) {
    return null;
  }

  // The Python service runs from `backend/`; the Node service runs from
  // `backend-node/`. Try the repository root and the backend-relative form.
  const attempts = [resolve(process.cwd(), '..', candidate), resolve(process.cwd(), candidate)];
  if (candidate.startsWith('backend/')) {
    const stripped = candidate.slice('backend/'.length);
    attempts.push(resolve(process.cwd(), '..', stripped), resolve(process.cwd(), stripped));
  }
  for (const attempt of attempts) {
    if (existsSync(attempt)) {
      return attempt;
    }
  }
  return null;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function findSampleJd(): string | null {
  for (const directory of ['backend/data/jds', 'data/jds']) {
    const resolved = firstExistingPath(directory);
    if (!resolved || !isDirectory(resolved)) {
      continue;
    }
    try {
      const files = readdirSync(resolved)
        .filter((name) => name.toLowerCase().endsWith('.txt'))
        .sort();
      const first = files[0];
      if (first) {
        return resolve(resolved, first);
      }
    } catch {
      // Try the next candidate directory.
    }
  }
  return null;
}

export async function parseJdNode(
  state: RecruitState,
  deps: GraphDeps = getGraphDeps(),
): Promise<Partial<RecruitState>> {
  const history = historyOf(state);
  const userMessage = history.length > 0 ? (history[history.length - 1]?.content ?? '') : '';

  // 1. Extract JD file and resume folder paths from the message.
  let resumeDirectory = DEFAULT_RESUME_DIR;
  let jdPath: string | null = null;

  const paths = userMessage.toLowerCase().match(/[\w\-./\\]+\.txt|[\w\-./\\]+resumes/g) ?? [];
  for (const path of paths) {
    if (path.includes('resumes')) {
      resumeDirectory = path;
    } else if (path.includes('jds') || path.endsWith('.txt')) {
      jdPath = path;
    }
  }

  for (const token of userMessage.split(/\s+/)) {
    const cleaned = token.replace(/^["',]+|["',]+$/g, '');
    if ((cleaned.includes('data/jds') || cleaned.includes('jds/')) && !jdPath) {
      jdPath = cleaned;
    } else if (
      (cleaned.includes('data/resumes') || cleaned.includes('resumes/')) &&
      resumeDirectory === DEFAULT_RESUME_DIR
    ) {
      resumeDirectory = cleaned;
    }
  }

  // Read raw JD text from the path, a pasted body, or a sample file.
  let rawJdText = '';
  if (jdPath) {
    const resolved = firstExistingPath(jdPath);
    if (resolved && isFile(resolved)) {
      rawJdText = readFileSync(resolved, 'utf8');
    }
  }

  if (!rawJdText) {
    if (
      userMessage.split(/\s+/).filter(Boolean).length > 10 &&
      !userMessage.startsWith('http') &&
      !jdPath
    ) {
      rawJdText = userMessage;
    } else {
      const sample = findSampleJd();
      if (sample) {
        rawJdText = readFileSync(sample, 'utf8');
        jdPath = sample;
      } else {
        return {
          conversation_history: [
            ...history,
            {
              role: 'assistant',
              content:
                'Please provide a valid Job Description file path or paste the text of the JD.',
            },
          ],
        };
      }
    }
  }

  // 2. Parse the JD into the structured model.
  const jdStructured = await deps.parseJd(rawJdText, jdPath ?? '');
  const role = jdStructured.role;
  const skills = jdStructured.required_skills;
  const experienceYears = jdStructured.experience_years;

  // 3. Ingest candidates from the target folder.
  const resolvedResumeDirectory = firstExistingPath(resumeDirectory);
  if (!resolvedResumeDirectory || !isDirectory(resolvedResumeDirectory)) {
    return {
      jd_structured: jdStructured,
      conversation_history: [
        ...history,
        {
          role: 'assistant',
          content: `Loaded JD for '${role}'. However, the resumes folder '${resumeDirectory}' was not found. Please point me to a valid folder of candidates.`,
        },
      ],
    };
  }

  let candidates;
  try {
    candidates = await deps.ingestResumes(
      resolvedResumeDirectory,
      state.user_id ?? 'local_dev_user_123',
    );
  } catch (error) {
    return {
      jd_structured: jdStructured,
      conversation_history: [
        ...history,
        {
          role: 'assistant',
          content: `Loaded JD for '${role}'. But resume ingestion failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }

  if (candidates.length === 0) {
    return {
      jd_structured: jdStructured,
      conversation_history: [
        ...history,
        {
          role: 'assistant',
          content: `Loaded JD for '${role}'. But no resumes were found in the folder '${resumeDirectory}' — nothing to screen yet.`,
        },
      ],
    };
  }

  const mismatch = await analyzeExperienceMismatch(experienceYears, candidates);
  const improvements = await suggestJdImprovements(rawJdText);

  let successMessage =
    `Successfully loaded and parsed Job Description for **${role}** ` +
    `(${experienceYears}+ years experience, skills: ${skills.join(', ')}).\n` +
    `Ingested ${candidates.length} resumes from '${resumeDirectory}' into the pgvector database.\n\n` +
    '### JD & Candidate Diagnostics:\n' +
    `${mismatch.message}\n`;

  if (improvements.length > 0) {
    successMessage +=
      '\n> [!NOTE]\n' +
      '> **Job Description Enhancements**:\n' +
      improvements.map((suggestion) => `> - ${suggestion}`).join('\n');
  }

  return {
    jd_structured: jdStructured,
    resumes: candidates,
    conversation_history: [...history, { role: 'assistant', content: successMessage }],
  };
}
