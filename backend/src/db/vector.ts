import { and, eq, ne } from 'drizzle-orm';

import type { Database } from './client.js';
import { resumeChunks } from './schema.js';
import { createRpcClient, databaseExecutor, type ResumeChunkMatch } from './rpc.js';

/**
 * pgvector integration path for resume embeddings.
 *
 * Port of the three operations in `backend/app/rag/vector_store.py`:
 * - `upsert_chunks` → `insertResumeChunks` (batched multi-row insert)
 * - `query_top_k` → `queryTopK` (delegates to the `match_resume_chunks` RPC)
 * - `clear_all_chunks` → `clearAllChunks` (delete all, optionally tenant-scoped)
 *
 * Embeddings stay 384-dimensional; the Drizzle `vector(384)` column serializes
 * number[] to pgvector's text literal.
 */

export interface ResumeChunkInput {
  candidateId: string;
  userId: string;
  chunkText: string;
  chunkIndex?: number;
  embedding: readonly number[];
}

export interface QueryTopKParams {
  queryEmbedding: readonly number[];
  k?: number;
  candidateId?: string | null;
  threshold?: number;
  userId?: string | null;
}

/** Insert resume chunks in one statement (no-op for an empty list). */
export async function insertResumeChunks(
  db: Database,
  chunks: readonly ResumeChunkInput[],
): Promise<number> {
  if (chunks.length === 0) {
    return 0;
  }
  const rows = chunks.map((chunk) => ({
    candidateId: chunk.candidateId,
    userId: chunk.userId,
    chunkText: chunk.chunkText,
    chunkIndex: chunk.chunkIndex ?? 0,
    embedding: [...chunk.embedding],
  }));
  await db.insert(resumeChunks).values(rows);
  return rows.length;
}

/** Top-k vector matches, tenant-scoped through the RPC's `filter_user_id`. */
export async function queryTopK(
  db: Database,
  { queryEmbedding, k = 3, candidateId = null, threshold = 0, userId = null }: QueryTopKParams,
): Promise<ResumeChunkMatch[]> {
  return createRpcClient(databaseExecutor(db)).matchResumeChunks({
    queryEmbedding,
    matchCount: k,
    matchThreshold: threshold,
    candidateId,
    userId,
  });
}

/**
 * Delete every chunk, optionally restricted to one tenant.
 *
 * Python uses `.neq("chunk_text", "")` to force a WHERE clause; the Drizzle
 * equivalent keeps the same predicate and adds `user_id` when supplied.
 */
export async function clearAllChunks(db: Database, userId?: string | null): Promise<void> {
  const predicate = userId
    ? and(ne(resumeChunks.chunkText, ''), eq(resumeChunks.userId, userId))
    : ne(resumeChunks.chunkText, '');
  await db.delete(resumeChunks).where(predicate);
}
