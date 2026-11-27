import { createGraphDeps, type GraphDeps } from '../src/graph/deps.js';
import { candidateSchema, type Candidate } from '../src/schemas/candidate.js';
import { jobDescriptionSchema, type JobDescription } from '../src/schemas/jd.js';
import { TavilyService } from '../src/services/tavily.js';

/**
 * Shared fixtures for the Phase 13 graph tests.
 *
 * Every dependency is local and deterministic: no Gemini key, no Tavily key,
 * no Postgres. `now` is pinned to Friday 13 November 2026 so scheduling tests
 * see stable business-day labels.
 */

export const FIXED_NOW = new Date('2026-11-13T09:30:00');

export interface RecordingDeps extends GraphDeps {
  readonly prompts: string[];
}

/** Build a dependency bundle with recording LLM/Tavily fakes. */
export function fakeDeps(overrides: Partial<GraphDeps> = {}): RecordingDeps {
  const prompts: string[] = [];
  const base = createGraphDeps({
    callLlm: async (prompt) => {
      prompts.push(prompt);
      return { text: '{}', provider: 'gemini', latencyMs: 0 };
    },
    embedText: async () => new Array<number>(384).fill(0),
    embedTexts: async (texts) => texts.map(() => new Array<number>(384).fill(0)),
    queryTopK: async () => [],
    getTavily: () => new TavilyService({ apiKey: '' }),
    ingestResumes: async () => [],
    parseJd: async (rawText) =>
      makeJd({ raw_text: rawText, role: 'Software Engineer', required_skills: ['Python'] }),
    now: () => FIXED_NOW,
    ...overrides,
  });

  return Object.assign(base, { prompts });
}

/** Candidate with every default filled in. */
export function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return candidateSchema.parse({
    candidate_id: 'candidate-1',
    name: 'Alice Smith',
    raw_text: 'Alice Smith python backend engineer',
    ...overrides,
  });
}

/** Job description with every default filled in. */
export function makeJd(overrides: Partial<JobDescription> = {}): JobDescription {
  return jobDescriptionSchema.parse({
    role: 'Senior Backend Engineer',
    required_skills: ['Python', 'FastAPI', 'PostgreSQL'],
    experience_years: 5,
    raw_text: 'We are hiring a Senior Backend Engineer.',
    ...overrides,
  });
}

/** Two candidates used by the memory tests. */
export function memoryCandidates(): Candidate[] {
  return [
    makeCandidate({
      candidate_id: 'c-alex',
      name: 'Alex Morgan',
      raw_text: 'Alex Morgan python backend',
    }),
    makeCandidate({
      candidate_id: 'c-bob',
      name: 'Bob Carter',
      raw_text: 'Bob Carter frontend react',
    }),
  ];
}

/** Conversation history helper: `history(['user','a'], ['assistant','b'])`. */
export function history(
  ...messages: Array<[role: string, content: string]>
): Array<{ role: string; content: string }> {
  return messages.map(([role, content]) => ({ role, content }));
}
