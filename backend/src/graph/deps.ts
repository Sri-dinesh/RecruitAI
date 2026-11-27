import { getDb } from '../db/client.js';
import { queryTopK, type QueryTopKParams } from '../db/vector.js';
import type { ResumeChunkMatch } from '../db/rpc.js';
import { callLlm, parseJsonSafely } from '../llm/router.js';
import { embedText, embedTexts } from '../rag/embeddings.js';
import type { Candidate } from '../schemas/candidate.js';
import { createIngestionService, type IngestionService } from '../services/ingestion-service.js';
import { parseStructuredJd } from '../services/jd-parser.js';
import { getTavilyService, type TavilyService } from '../services/tavily.js';

/**
 * Injectable boundaries for graph nodes.
 *
 * Python imports services directly. TypeScript nodes take this bundle instead
 * so unit tests can run the whole graph without Postgres, Gemini or Tavily.
 * Production callers use `defaultGraphDeps()`; the graph builder accepts an
 * override object for integration tests and future DI.
 */

export interface GraphDeps {
  readonly callLlm: typeof callLlm;
  readonly parseJsonSafely: typeof parseJsonSafely;
  readonly embedText: typeof embedText;
  readonly embedTexts: typeof embedTexts;
  readonly queryTopK: (params: QueryTopKParams) => Promise<ResumeChunkMatch[]>;
  readonly getTavily: () => TavilyService;
  readonly ingestResumes: (directory: string, userId?: string | null) => Promise<Candidate[]>;
  readonly parseJd: typeof parseStructuredJd;
  readonly now: () => Date;
}

let ingestionService: IngestionService | undefined;

function getIngestionService(): IngestionService {
  ingestionService ??= createIngestionService();
  return ingestionService;
}

/** Production wiring: process-wide DB pool, Gemini router, Tavily singleton. */
export function defaultGraphDeps(): GraphDeps {
  return {
    callLlm,
    parseJsonSafely,
    embedText,
    embedTexts,
    queryTopK: (params) => queryTopK(getDb(), params),
    getTavily: getTavilyService,
    ingestResumes: (directory, userId) =>
      getIngestionService().ingestResumesFromDirectory(directory, userId),
    parseJd: parseStructuredJd,
    now: () => new Date(),
  };
}

let cached: GraphDeps | undefined;

/** Memoised default bundle used when a node is called without dependencies. */
export function getGraphDeps(): GraphDeps {
  cached ??= defaultGraphDeps();
  return cached;
}

/** Build a dependency bundle with selected overrides (tests, DI). */
export function createGraphDeps(overrides: Partial<GraphDeps> = {}): GraphDeps {
  return { ...defaultGraphDeps(), ...overrides };
}

/** Test helper: drop memoised dependencies so env changes take effect. */
export function resetGraphDepsForTests(): void {
  cached = undefined;
  ingestionService = undefined;
}
