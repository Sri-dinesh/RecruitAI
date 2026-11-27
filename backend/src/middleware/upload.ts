import multer, { MulterError } from 'multer';
import type { RequestHandler } from 'express';

import { HttpError } from '../types/errors.js';

/**
 * Multipart parsing for resume ingestion.
 *
 * FastAPI parsed `UploadFile` bodies only for the ingest routes; the Express
 * equivalent is a reusable middleware applied per route in Phase 12, not a
 * global parser.
 *
 * Memory storage mirrors FastAPI reading uploads into memory. The Python route
 * enforces the 15 MB per-file limit after reading and reports failures per
 * file (HTTP 207 multi-status), so a size limit must not reject the whole
 * request up front. Phase 23 adds a bounded streaming collector: an oversized
 * file stops buffering at 15 MB + 1 byte (the rest is drained and discarded),
 * is flagged `sizeExceeded`, and the handler emits the same per-file failure
 * while a healthy batch keeps returning 207.
 *
 * Count/field limits are safe to enforce request-wide: they bound memory before
 * any file is buffered and map to FastAPI-shaped 400/413 errors.
 */
export const MAX_RESUME_FILE_SIZE_BYTES = 15 * 1024 * 1024;
export const MAX_RESUME_FILES_PER_BATCH = 10;

type BoundedFileInfo = Partial<Express.Multer.File> & { sizeExceeded?: boolean };

const boundedMemoryStorage: multer.StorageEngine = {
  _handleFile(_req, file, callback): void {
    if (!file.stream) {
      callback(new Error('Upload stream is unavailable.'));
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let sizeExceeded = false;

    file.stream.on('data', (raw: Buffer | string) => {
      if (sizeExceeded) {
        // Keep draining the socket so the rest of the multipart body parses,
        // but never buffer beyond the per-file cap.
        return;
      }
      const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      const remaining = MAX_RESUME_FILE_SIZE_BYTES - size;
      if (chunk.length > remaining) {
        if (remaining > 0) {
          chunks.push(chunk.subarray(0, remaining));
          size += remaining;
        }
        sizeExceeded = true;
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
    });

    file.stream.on('error', (error: Error) => {
      callback(error);
    });

    file.stream.on('end', () => {
      const info: BoundedFileInfo = {
        // The handler checks the flag before touching the buffer.
        buffer: sizeExceeded ? Buffer.alloc(0) : Buffer.concat(chunks),
        size,
        sizeExceeded,
      };
      callback(null, info);
    });
  },

  _removeFile(_req, _file, callback): void {
    callback(null);
  },
};

const parser = multer({
  storage: boundedMemoryStorage,
  limits: {
    files: MAX_RESUME_FILES_PER_BATCH,
    fields: 10,
    fieldNameSize: 200,
    fieldSize: 64 * 1024,
    parts: 40,
    headerPairs: 2_000,
  },
}).any();

/**
 * Accept every uploaded file, mirroring FastAPI's tolerant `files` / `file`
 * handling. The ingest handler selects by field name.
 */
export const resumeUpload: RequestHandler = (req, res, next) => {
  parser(req, res, (error: unknown) => {
    if (error === undefined || error === null) {
      next();
      return;
    }
    if (error instanceof MulterError) {
      next(mapMulterError(error));
      return;
    }
    next(error);
  });
};

function mapMulterError(error: MulterError): HttpError {
  switch (error.code) {
    case 'LIMIT_FILE_COUNT':
      return new HttpError(
        400,
        `Too many files. A maximum of ${MAX_RESUME_FILES_PER_BATCH} resumes can be uploaded per batch.`,
      );
    case 'LIMIT_FILE_SIZE':
      return new HttpError(413, 'File exceeds the maximum allowed size of 15 MB.');
    case 'LIMIT_UNEXPECTED_FILE':
      return new HttpError(400, `Unexpected file field '${error.field ?? 'unknown'}'.`);
    default:
      return new HttpError(400, `Invalid multipart upload: ${error.message}`);
  }
}
