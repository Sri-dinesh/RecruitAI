import { Router, type RequestHandler } from 'express';

import type { AppConfig } from '../config/index.js';
import { getCurrentUserId } from '../context/request-context.js';
import { requireAuth } from '../middleware/auth.js';
import { resumeUpload } from '../middleware/upload.js';
import { validateForm } from '../middleware/validate.js';
import {
  ingestFormSchema,
  type IngestFailure,
  type IngestForm,
  type IngestResult,
  type IngestSuccess,
  type UploadedResumeFile,
} from '../schemas/ingest.js';
import {
  createIngestionService,
  MAX_UPLOAD_SIZE_BYTES,
  resolveFilenameAndExtension,
  SUPPORTED_EXTENSIONS,
  type IngestionService,
} from '../services/ingestion-service.js';
import { HttpError } from '../types/errors.js';
import { ValidationError } from '../schemas/validation.js';

/**
 * Port of `backend/app/api/routes_ingest.py`.
 *
 * Preserved behavior:
 * - `files` (many) and `file` (single) are accepted, in that order;
 * - per-file failures never abort a batch: a single failure returns 400, a
 *   mixed batch returns RFC 4918 HTTP 207 with one result per upload;
 * - extension resolution uses the filename, then Content-Type, then magic
 *   bytes; unsupported formats and >15 MB files produce the Python messages;
 * - JD upload maps read failures to 400, empty text to 400 and parse failures
 *   to 500.
 */

export interface IngestRouterOptions {
  readonly config?: AppConfig;
  readonly ingestionService?: IngestionService;
  /** Pre-built auth middleware (the API router shares one instance). */
  readonly auth?: RequestHandler;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function uploadsFrom(req: { files?: unknown }): UploadedResumeFile[] {
  return Array.isArray(req.files) ? (req.files as UploadedResumeFile[]) : [];
}

function isSupported(extension: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extension);
}

export function createIngestRouter(options: IngestRouterOptions = {}): Router {
  const router = Router();
  const service =
    options.ingestionService ??
    createIngestionService(options.config === undefined ? {} : { config: options.config });
  const auth =
    options.auth ?? (options.config ? requireAuth({ config: options.config }) : requireAuth());

  router.post('/upload', auth, resumeUpload, validateForm(ingestFormSchema), async (req, res) => {
    const userId = getCurrentUserId();
    const form = req.body as IngestForm;
    const uploads = uploadsFrom(req);
    const filesField = uploads.filter((file) => file.fieldname === 'files');
    const singleField = uploads.filter((file) => file.fieldname === 'file').at(-1);

    const uploadList = [...filesField, ...(singleField ? [singleField] : [])];
    if (uploadList.length === 0) {
      throw new HttpError(400, 'No resume files were provided.');
    }

    const results: IngestResult[] = [];
    let hasSuccess = false;
    let hasFailure = false;

    for (const upload of uploadList) {
      const rawName = upload.originalname || 'resume.pdf';
      try {
        const fileBytes = upload.buffer;
        const { filename, extension } = resolveFilenameAndExtension(
          rawName,
          upload.mimetype || '',
          fileBytes,
        );

        if (!isSupported(extension)) {
          hasFailure = true;
          results.push({
            filename: rawName,
            status: 'failed',
            error: `Unsupported file format '${extension}'. Supported formats: PDF, DOCX, TXT, PNG, JPG.`,
          });
          continue;
        }

        if (fileBytes.length > MAX_UPLOAD_SIZE_BYTES) {
          hasFailure = true;
          results.push({
            filename: rawName,
            status: 'failed',
            error: `File '${filename}' exceeds maximum allowed size of 15 MB.`,
          });
          continue;
        }

        // 1. Parse the resume (deterministic; no generative LLM calls).
        const parsed = await service.parseResume(fileBytes, filename);
        if (!parsed.raw_text || parsed.raw_text === 'Empty Resume') {
          hasFailure = true;
          results.push({
            filename: rawName,
            status: 'failed',
            error: 'No readable text could be extracted from the file.',
          });
          continue;
        }

        // 2. Persist, score against the session JD, and embed chunks.
        const candidate = await service.ingestCandidateObject(parsed, userId, form.session_id);
        hasSuccess = true;
        const item: IngestSuccess = {
          ...candidate,
          filename,
          status: 'success',
          candidate_id: candidate.candidate_id,
          name: candidate.name,
        };
        results.push(item);
      } catch (error) {
        hasFailure = true;
        results.push({
          filename: rawName,
          status: 'failed',
          error: `Error ingesting '${rawName}': ${errorMessage(error)}`,
        });
      }
    }

    // Single-file validation errors keep FastAPI's plain 400 shape.
    if (uploadList.length === 1 && hasFailure && !hasSuccess) {
      const failure = results[0] as IngestFailure | undefined;
      throw new HttpError(400, failure?.error ?? 'Upload failed');
    }

    res.status(hasFailure ? 207 : 200).json(results);
  });

  router.post(
    '/upload-jd',
    auth,
    resumeUpload,
    validateForm(ingestFormSchema),
    async (req, res) => {
      const userId = getCurrentUserId();
      const form = req.body as IngestForm;
      const upload = uploadsFrom(req)
        .filter((file) => file.fieldname === 'file')
        .at(-1);

      if (!upload) {
        throw new ValidationError([
          { type: 'missing', loc: ['body', 'file'], msg: 'Field required', input: null },
        ]);
      }

      const rawName = upload.originalname || 'jd.pdf';
      const fileBytes = upload.buffer;
      const { filename, extension } = resolveFilenameAndExtension(
        rawName,
        upload.mimetype || '',
        fileBytes,
      );

      if (!isSupported(extension)) {
        throw new HttpError(
          400,
          `Unsupported file format '${extension}'. Supported formats: PDF, DOCX, TXT, PNG, JPG.`,
        );
      }

      if (fileBytes.length > MAX_UPLOAD_SIZE_BYTES) {
        throw new HttpError(413, `File '${filename}' exceeds maximum allowed size of 15 MB.`);
      }

      let rawText: string;
      try {
        rawText = await service.extractText(fileBytes, filename);
      } catch (error) {
        throw new HttpError(400, `Failed to read file content: ${errorMessage(error)}`);
      }

      if (!rawText.trim()) {
        throw new HttpError(400, 'The uploaded JD file is empty.');
      }

      try {
        const parsed = await service.parseJobDescription(rawText, filename);
        await service.saveJobDescription(parsed, userId, {
          rawText,
          sessionId: form.session_id,
        });
        res.json(parsed);
      } catch (error) {
        throw new HttpError(500, `Failed to parse JD: ${errorMessage(error)}`);
      }
    },
  );

  return router;
}
