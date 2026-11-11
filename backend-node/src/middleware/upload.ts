import multer from 'multer';
import type { RequestHandler } from 'express';

/**
 * Multipart parsing for resume ingestion.
 *
 * FastAPI parsed `UploadFile` bodies only for the ingest routes; the Express
 * equivalent is a reusable middleware applied per route in Phase 12, not a
 * global parser.
 *
 * Memory storage mirrors FastAPI reading uploads into memory. The Python route
 * enforces the 15 MB per-file limit after reading and reports failures per
 * file (HTTP 207 multi-status), so multer must not reject the whole request
 * first. Phase 12 applies these constants in the handler; Phase 23 adds
 * fleet-wide request limits.
 */
export const MAX_RESUME_FILE_SIZE_BYTES = 15 * 1024 * 1024;
export const MAX_RESUME_FILES_PER_BATCH = 10;

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Accept every uploaded file, mirroring FastAPI's tolerant `files` / `file`
 * handling. The ingest handler selects by field name.
 */
export const resumeUpload: RequestHandler = upload.any();
