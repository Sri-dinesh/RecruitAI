import { parentPort } from 'node:worker_threads';

import { parseDocumentInline } from '../services/document-parser.js';
import {
  renderRecruitmentReport,
  type RecruitmentReportOptions,
} from '../services/report-generator.js';
import { parseStructuredResumeInline } from '../services/resume-parser.js';
import type { WorkerTaskRequest, WorkerTaskResponse } from './pool.js';

/**
 * Worker-thread entry point for CPU-heavy document and report work.
 *
 * Only structured-cloneable payloads cross the boundary: bytes/paths and raw
 * text in, strings/objects/PDF bytes out. LLM refinement callbacks stay on the
 * request thread and therefore run inline.
 */

if (!parentPort) {
  throw new Error('task-worker must run inside a worker thread.');
}

parentPort.on('message', (request: WorkerTaskRequest) => {
  void handle(request);
});

async function handle(request: WorkerTaskRequest): Promise<void> {
  try {
    const result = await execute(request);
    post({ id: request.id, ok: true, result });
  } catch (error) {
    post({
      id: request.id,
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'Error',
      },
    });
  }
}

async function execute(request: WorkerTaskRequest): Promise<unknown> {
  switch (request.task) {
    case 'parseDocument': {
      const payload = request.payload as { input: Uint8Array | string; filename?: string };
      return parseDocumentInline(payload.input as unknown as Buffer, payload.filename ?? '');
    }
    case 'parseStructuredResume': {
      const payload = request.payload as { rawText: string; filename?: string };
      return parseStructuredResumeInline(payload.rawText, payload.filename ?? '');
    }
    case 'renderReport': {
      const options = (request.payload ?? {}) as RecruitmentReportOptions;
      return renderRecruitmentReport(options);
    }
    default: {
      const exhaustive: never = request.task;
      throw new Error(`Unknown worker task: ${String(exhaustive)}`);
    }
  }
}

function post(message: WorkerTaskResponse): void {
  parentPort?.postMessage(message);
}
