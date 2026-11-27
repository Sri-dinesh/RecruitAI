import { callLlm, parseJsonSafely } from '../llm/router.js';
import type { Candidate } from '../schemas/candidate.js';
import { createLogger } from '../telemetry/logger.js';

/**
 * Port of `backend/app/services/mismatch_analyzer.py`.
 *
 * Three diagnostics used by JD loading and the red-flag node:
 * - experience extraction (regex first, LLM fallback, result cached on the
 *   candidate object);
 * - JD-vs-pool experience mismatch analysis;
 * - LLM red-flag detection, also cached on the candidate.
 */

const logger = createLogger('recruitai.mismatch_analyzer');

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const EXPERIENCE_PATTERNS: readonly RegExp[] = [
  /(?:\b|^)(?<years>\d+(?:\.\d+)?)\s*\+?\s*years?\b(?:\s*of\s*experience|\s*experience|\s*in|\s*as)?/gi,
  /(?:\b|^)(?<years>\d+(?:\.\d+)?)\s*\+?\s*yrs?\b/gi,
];

/**
 * Extract total years of experience with regex heuristics.
 * Looks for phrases like '7+ years', '5 years of experience', '8 yrs'.
 */
export function extractExperienceViaRegex(text: string): number | null {
  const matches: number[] = [];

  for (const pattern of EXPERIENCE_PATTERNS) {
    // Fresh lastIndex per scan; these are module-level global regexes.
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match !== null) {
      const value = Number(match.groups?.years);
      if (Number.isFinite(value) && value >= 0.5 && value <= 40.0) {
        matches.push(value);
      }
      match = pattern.exec(text);
    }
  }

  return matches.length > 0 ? Math.max(...matches) : null;
}

const EXPERIENCE_SYSTEM_INSTRUCTION =
  "You are an AI resume parser. Analyze the candidate's resume and extract their total years " +
  'of professional working experience. Respond with a JSON object containing ' +
  '"experience_years": float. If it is less than a year or internship only, return a decimal value like 0.5. ' +
  'Output ONLY valid JSON. No other text.';

/**
 * Extract total years of experience, caching the result on the candidate.
 * Regex runs first; only an unparseable resume costs an LLM call.
 */
export async function extractCandidateExperience(candidate: Candidate): Promise<number> {
  if (candidate.experience_years !== null && candidate.experience_years !== undefined) {
    return candidate.experience_years;
  }

  const regexExperience = extractExperienceViaRegex(candidate.raw_text ?? '');
  if (regexExperience !== null) {
    candidate.experience_years = regexExperience;
    return regexExperience;
  }

  const prompt = `Resume Content:\n${candidate.raw_text ?? ''}`;
  try {
    const response = await callLlm(prompt, {
      systemInstruction: EXPERIENCE_SYSTEM_INSTRUCTION,
      jsonMode: true,
    });
    const data = asRecord(parseJsonSafely(response.text));
    const experience = Number(data?.experience_years ?? 0.0);
    const value = Number.isFinite(experience) ? experience : 0.0;
    candidate.experience_years = value;
    return value;
  } catch (error) {
    logger.warn(`Error extracting experience years for ${candidate.name}: ${errorMessage(error)}`, {
      status: 'failed',
    });
    return 0.0;
  }
}

export interface ExperienceMismatchResult {
  readonly has_mismatch: boolean;
  readonly average_experience?: number;
  readonly mismatch_percentage?: number;
  readonly message: string;
}

/** Compare the candidate pool's experience distribution with the JD target. */
export async function analyzeExperienceMismatch(
  jdExperience: number,
  candidates: readonly Candidate[],
): Promise<ExperienceMismatchResult> {
  if (candidates.length === 0) {
    return {
      has_mismatch: false,
      message: 'No candidates loaded to analyze experience mismatch.',
    };
  }

  const experiences = await Promise.all(
    candidates.map((candidate) => extractCandidateExperience(candidate)),
  );
  const average = experiences.reduce((sum, value) => sum + value, 0) / experiences.length;

  const underqualified = experiences.filter((value) => value < jdExperience);
  const mismatchPercentage = (underqualified.length / candidates.length) * 100;
  const hasMismatch = mismatchPercentage >= 50.0;

  const lines = [
    `Average experience of loaded candidates: **${average.toFixed(1)} years** (Target JD: **${jdExperience} years**).`,
  ];

  if (hasMismatch) {
    lines.push(
      '\n> [!WARNING]\n' +
        `> **Experience Mismatch Alert**: **${mismatchPercentage.toFixed(0)}%** of the candidates have less than the ` +
        `required ${jdExperience} years of experience. Consider lowering the required experience to **3 years** ` +
        'to capture more of the applicant pool, or source candidates with more senior profiles.',
    );
  } else {
    lines.push(
      '\nCandidate experience distribution aligns well with the job description requirements.',
    );
  }

  return {
    has_mismatch: hasMismatch,
    average_experience: average,
    mismatch_percentage: mismatchPercentage,
    message: lines.join('\n'),
  };
}

const JD_IMPROVEMENT_SYSTEM_INSTRUCTION =
  'You are an AI recruitment editor. Inspect the job description text and identify missing standard fields ' +
  'such as Compensation/Salary details, Job Location/Work Mode (Remote, Hybrid, Onsite), ' +
  'Company Benefits/Perks, or Reporting structure. ' +
  'Output a JSON object containing a list of strings: {"suggestions": ["string"]}. ' +
  'If all fields are present, return an empty list.';

/** Suggest missing standard JD sections; provider failure yields `[]`. */
export async function suggestJdImprovements(jdRawText: string): Promise<string[]> {
  const prompt = `Job Description:\n${jdRawText}`;
  try {
    const response = await callLlm(prompt, {
      systemInstruction: JD_IMPROVEMENT_SYSTEM_INSTRUCTION,
      jsonMode: true,
    });
    const data = asRecord(parseJsonSafely(response.text));
    const suggestions = data?.suggestions;
    return Array.isArray(suggestions)
      ? suggestions.filter((value): value is string => typeof value === 'string')
      : [];
  } catch (error) {
    logger.warn(`Error checking JD improvements: ${errorMessage(error)}`, { status: 'failed' });
    return [];
  }
}

const RED_FLAG_SYSTEM_INSTRUCTION =
  'You are an expert resume analyst specializing in detecting red flags in candidate resumes. ' +
  'Carefully analyze the resume for: timeline gaps (unexplained periods of 6+ months), ' +
  'inconsistent dates (overlapping positions, suspicious date ranges), ' +
  'job hopping (multiple jobs < 1 year in a row), inflated or vague claims, ' +
  'and any other suspicious patterns. ' +
  'Output a JSON object: {"red_flags": ["description 1", "description 2"]}. ' +
  'If the resume looks clean with no issues, return {"red_flags": []}. ' +
  'Be specific and concise for each flag (max 2 sentences per flag). ' +
  'Output ONLY valid JSON, no other text.';

/**
 * LLM red-flag detection, cached on `candidate.red_flags`.
 * An already-analysed candidate returns its cached list without another call.
 */
export async function detectRedFlags(candidate: Candidate): Promise<string[]> {
  if (candidate.red_flags !== null && candidate.red_flags !== undefined) {
    return candidate.red_flags;
  }

  const prompt =
    'Analyze the following resume for red flags:\n\n' +
    `Candidate: ${candidate.name}\n` +
    `Resume Content:\n${candidate.raw_text ?? ''}`;

  try {
    const response = await callLlm(prompt, {
      systemInstruction: RED_FLAG_SYSTEM_INSTRUCTION,
      jsonMode: true,
    });
    const data = asRecord(parseJsonSafely(response.text));
    const rawFlags = Array.isArray(data?.red_flags) ? data.red_flags : [];
    const flags = rawFlags
      .filter((flag) => flag !== null && flag !== undefined && flag !== '')
      .map(String);
    candidate.red_flags = flags;
    return flags;
  } catch (error) {
    logger.warn(`Error detecting red flags for ${candidate.name}: ${errorMessage(error)}`, {
      status: 'failed',
    });
    return [];
  }
}
