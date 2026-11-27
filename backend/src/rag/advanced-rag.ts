import { callLlm, parseJsonSafely } from '../llm/router.js';
import { createLogger } from '../telemetry/logger.js';

/**
 * Port of `backend/app/rag/advanced_rag.py`.
 *
 * Two LLM-assisted retrieval steps used by screening:
 * - `expandQuery` turns the JD-shaped query into related keywords/synonyms
 *   before embedding, improving recall for paraphrase-heavy resumes;
 * - `rerankChunks` scores retrieved snippets 1-10 in a single batch call and
 *   keeps the top N.
 *
 * Both degrade to their deterministic fallback on provider failure, matching
 * the Python `try/except` blocks.
 */

const logger = createLogger('recruitai.advanced_rag');

export interface JdContext {
  readonly role?: string | null;
  readonly required_skills?: readonly string[] | null;
  readonly experience_years?: number | null;
}

export interface RankableChunk {
  readonly chunk_text?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Expand a query into related keywords; falls back to the original query. */
export async function expandQuery(query: string, jd?: JdContext | null): Promise<string> {
  const systemInstruction =
    "You are an expert HR sourcer. Expand the user's search query into a comprehensive " +
    'list of matching keywords, synonyms, alternative spelling, and closely related technical skills. ' +
    'Output ONLY the keywords separated by spaces. Do not write introductory or explanatory text.';

  let prompt = `Original Query: '${query}'`;
  if (jd) {
    const role = jd.role ?? '';
    const skills = jd.required_skills ? jd.required_skills.join(', ') : '';
    prompt += `\nActive JD Context: Role='${role}', Skills='${skills}'`;
  }

  try {
    const response = await callLlm(prompt, { systemInstruction });
    let expanded = response.text.trim().replaceAll('\n', ' ');
    expanded = expanded.replaceAll('"', '').replaceAll("'", '');
    return `${query} ${expanded}`;
  } catch (error) {
    logger.warn(
      `Error in query expansion: ${errorMessage(error)}. Falling back to original query.`,
      {
        status: 'fallback',
      },
    );
    return query;
  }
}

/**
 * Batch LLM relevance reranking. Chunks are copied (never mutated) and sorted
 * by descending `rerank_score`, with the original order breaking ties.
 */
export async function rerankChunks<T extends RankableChunk>(
  query: string,
  chunks: readonly T[],
  topN = 3,
  jd?: JdContext | null,
): Promise<Array<T & { rerank_score: number }>> {
  if (chunks.length === 0) {
    return [];
  }

  const systemInstruction =
    'You are an AI recruitment ranker. Evaluate the relevance of the following resume snippets ' +
    'relative to the query and the required Job Description skills. Assign a relevance score from 1 to 10 for each snippet. ' +
    'Output a JSON object containing a list of scores, exactly like: ' +
    '{"scores": [{"id": 0, "relevance_score": X}, {"id": 1, "relevance_score": Y}, ...]} ' +
    'where id matches the index of the snippet. Do not include any other text.';

  const snippets: string[] = [];
  chunks.forEach((chunk, index) => {
    snippets.push(`Snippet ID: ${index}\nText: ${chunk.chunk_text ?? ''}`);
  });

  let prompt = `Query: ${query}\n`;
  if (jd) {
    const role = jd.role ?? '';
    const skills = jd.required_skills ? jd.required_skills.join(', ') : '';
    prompt += `Job Role: ${role}\nRequired Skills: ${skills}\n`;
  }
  prompt += snippets.join('\n---\n');

  const scores = new Map<number, number>();
  try {
    const response = await callLlm(prompt, { systemInstruction, jsonMode: true });
    const data = asRecord(parseJsonSafely(response.text));
    const scoreList = Array.isArray(data?.scores) ? data.scores : [];
    for (const item of scoreList) {
      const record = asRecord(item);
      if (!record || record.id === undefined || record.id === null) {
        continue;
      }
      const id = Number(record.id);
      const rawScore = Number(record.relevance_score ?? 1.0);
      if (Number.isFinite(id)) {
        scores.set(id, Number.isFinite(rawScore) ? rawScore : 1.0);
      }
    }
  } catch (error) {
    logger.warn(
      `Error in batch reranking: ${errorMessage(error)}. Falling back to default scores.`,
      {
        status: 'fallback',
      },
    );
  }

  const scored = chunks.map((chunk, index) => ({
    ...chunk,
    rerank_score: scores.get(index) ?? 1.0,
  }));

  // Array.prototype.sort is stable in modern V8, so ties keep retrieval order.
  scored.sort((left, right) => right.rerank_score - left.rerank_score);
  return scored.slice(0, topN);
}
