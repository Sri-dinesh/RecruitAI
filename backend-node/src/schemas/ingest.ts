import { z } from 'zod';

import { optionalString } from './common.js';

/**
 * Multipart form fields for `app/api/routes_ingest.py`.
 *
 * FastAPI parsed `files: List[UploadFile] = File(default=[])`,
 * `file: UploadFile = File(default=None)` and
 * `session_id: Optional[str] = Form(default=None)`. File payloads themselves
 * are validated by the multer middleware (size/count) and the ingest handler
 * (extension/content), so only the form field is a Zod schema.
 */
export const ingestFormSchema = z.object({
  session_id: optionalString(),
});

/** Subset of `Express.Multer.File` the ingest service needs. */
export interface UploadedResumeFile {
  readonly fieldname: string;
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;
  readonly buffer: Buffer;
}

/** `POST /api/ingest/upload` after multer has populated the request. */
export interface ResumeIngestRequest {
  readonly session_id: string | null;
  readonly files: readonly UploadedResumeFile[];
  readonly file?: UploadedResumeFile;
}

/** `POST /api/ingest/upload-jd` after multer has populated the request. */
export interface JobDescriptionIngestRequest {
  readonly session_id: string | null;
  readonly file: UploadedResumeFile;
}

export type IngestForm = z.infer<typeof ingestFormSchema>;

/** Per-file result returned by `POST /api/ingest/upload` (200 or 207). */
export interface IngestFailure {
  readonly filename: string;
  readonly status: 'failed';
  readonly error: string;
}

/** Successful ingest rows also contain the full Candidate fields. */
export interface IngestSuccess {
  readonly filename: string;
  readonly status: 'success';
  readonly candidate_id: string;
  readonly name: string;
  readonly [key: string]: unknown;
}

export type IngestResult = IngestSuccess | IngestFailure;
