import { z } from 'zod';

import { optionalString, pydanticInt } from './common.js';

/**
 * Port of the inline models in `app/api/routes_evaluate.py`.
 *
 * `tech_score`/`comm_score` are required integers constrained to 1..5. Pydantic
 * coerces `"3"`/`3.0`/`true` to an integer and rejects `3.5` with
 * `int_from_float`; `pydanticInt` does the same before applying the range.
 */
export const candidateEvaluationRequestSchema = z.object({
  candidate_id: z.string(),
  job_id: optionalString(),
  session_id: optionalString(),
  tech_score: pydanticInt({ ge: 1, le: 5 }),
  comm_score: pydanticInt({ ge: 1, le: 5 }),
  notes: optionalString(''),
  status: optionalString(),
});

export const atsExportRequestSchema = z.object({
  format: z.string().default('json'),
  session_id: optionalString(),
});

export const candidateStatusRequestSchema = z.object({
  status: z.string(),
  session_id: optionalString(),
  actor: optionalString('human_recruiter'),
});

export type CandidateEvaluationRequest = z.infer<typeof candidateEvaluationRequestSchema>;
export type ATSExportRequest = z.infer<typeof atsExportRequestSchema>;
export type CandidateStatusRequest = z.infer<typeof candidateStatusRequestSchema>;

/**
 * Ad-hoc response shapes (the Python routes do not declare `response_model`).
 * Kept as types only; Phase 15 route handlers can refine them if needed.
 */
export interface CandidateEvaluationSavedResponse {
  readonly status: 'success';
  readonly message: string;
  readonly evaluation: Record<string, unknown>;
}

export interface CandidateEvaluationResponse {
  readonly candidate_id: string;
  readonly user_id: string;
  readonly tech_score: number;
  readonly comm_score: number;
  readonly notes: string;
  readonly status: string | null;
  readonly updated_at?: string | null;
}

export interface ATSExportResponse {
  readonly status: 'success';
  readonly format: string;
  readonly export_timestamp: string;
  readonly evaluations_count: number;
  readonly evaluations: Record<string, unknown>;
}

export interface CandidateStatusResponse {
  readonly status: 'success';
  readonly candidate_id: string;
  readonly candidate_status: string;
  readonly new_status: string;
}
