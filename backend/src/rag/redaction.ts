/**
 * Embedding-path alias for the shared redaction choke point.
 *
 * The full reversible sanitizer and prompt-injection detector live in
 * `src/services/redaction.ts` (Phase 13). Ingestion only needs the stateless
 * embedding variant, so this module keeps its historical import path and
 * re-exports exactly that function.
 */

export { redactPiiForEmbedding } from '../services/redaction.js';
