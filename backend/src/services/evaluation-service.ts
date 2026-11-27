import { randomUUID } from 'node:crypto';

import type { AppConfig } from '../config/index.js';
import {
  createWorkspaceQueryStore,
  type DbRow,
  type WorkspaceQueryStore,
} from '../db/workspace-query-store.js';
import type {
  ATSExportRequest,
  CandidateEvaluationRequest,
  CandidateStatusRequest,
} from '../schemas/evaluate.js';
import type { PaymentService } from './payment-service.js';
import { asJsonObject } from './session-service.js';
import { createLogger } from '../telemetry/logger.js';
import { EVALUATION_QUOTA_MESSAGE, HttpError, InsufficientCreditsError } from '../types/errors.js';
import { toUuidStr } from './uuid-utils.js';

const logger = createLogger('recruitai.routes_evaluate');

/** Port of `backend/app/api/routes_evaluate.py`. */

export interface EvaluationServiceOptions {
  readonly config?: AppConfig;
  readonly queryStore?: WorkspaceQueryStore;
  /** Shared credit service; required by `saveEvaluation`. */
  readonly paymentService?: Pick<PaymentService, 'getUserCredits' | 'consumeCredits'>;
  readonly now?: () => Date;
}

export interface CsvExport {
  readonly contentType: 'text/csv';
  readonly filename: string;
  readonly body: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow(values: readonly unknown[]): string {
  return `${values.map(csvCell).join(',')}\r\n`;
}

export class EvaluationService {
  private readonly config: AppConfig | undefined;
  private store: WorkspaceQueryStore | undefined;
  private readonly payment: Pick<PaymentService, 'getUserCredits' | 'consumeCredits'> | undefined;
  private readonly now: () => Date;

  constructor(options: EvaluationServiceOptions = {}) {
    this.config = options.config;
    this.store = options.queryStore;
    this.payment = options.paymentService;
    this.now = options.now ?? (() => new Date());
  }

  private getStore(): WorkspaceQueryStore {
    this.store ??= createWorkspaceQueryStore(
      this.config === undefined ? {} : { config: this.config },
    );
    return this.store;
  }

  private getPayment(): Pick<PaymentService, 'getUserCredits' | 'consumeCredits'> {
    if (!this.payment) {
      throw new HttpError(500, 'Payment service is not configured.');
    }
    return this.payment;
  }

  async saveEvaluation(req: CandidateEvaluationRequest, userId: string): Promise<DbRow> {
    const nowIso = this.now().toISOString();
    const store = this.getStore();
    const payment = this.getPayment();
    const normCandidateId = toUuidStr(req.candidate_id);
    const normUserId = toUuidStr(userId);

    const currentCredits = await payment.getUserCredits(userId);
    if (currentCredits <= 0) {
      throw new InsufficientCreditsError(EVALUATION_QUOTA_MESSAGE);
    }

    const evaluationPayload: DbRow = {
      candidate_id: req.candidate_id,
      user_id: userId,
      tech_score: req.tech_score,
      comm_score: req.comm_score,
      notes: req.notes,
      status: req.status,
      updated_at: nowIso,
    };

    const rubricData: DbRow = {
      tech_score: req.tech_score,
      comm_score: req.comm_score,
      notes: req.notes,
      updated_at: nowIso,
    };

    try {
      // 1. Update or create the candidate record.
      const candidate = await store.getCandidate(normUserId, normCandidateId);
      if (candidate) {
        const metadata = asJsonObject(candidate['metadata']);
        if (req.status) {
          metadata['status'] = req.status;
        }
        metadata['rubric'] = rubricData;
        if (req.session_id) {
          metadata['session_id'] = req.session_id;
          const sessionIds = new Set<unknown>(
            Array.isArray(metadata['session_ids']) ? metadata['session_ids'] : [],
          );
          sessionIds.add(req.session_id);
          metadata['session_ids'] = [...sessionIds];
        }
        await store.updateCandidateMetadata(normUserId, normCandidateId, metadata);
      } else {
        const stubMetadata: DbRow = {
          status: req.status ?? 'evaluated',
          rubric: rubricData,
        };
        if (req.session_id) {
          stubMetadata['session_id'] = req.session_id;
          stubMetadata['session_ids'] = [req.session_id];
        }
        await store.insertCandidate({
          id: normCandidateId,
          userId: normUserId,
          fullName: `Candidate ${req.candidate_id}`,
          email: `${req.candidate_id}@recruitai.local`,
          rawResumeText: '',
          metadata: stubMetadata,
        });
      }

      // 2. Update the existing application or create one with an explicit link.
      const application = await store.getApplicationForCandidate(normUserId, normCandidateId);
      if (application) {
        const applicationId = application['id'];
        const reasoning = asJsonObject(application['match_reasoning']);
        reasoning['rubric'] = rubricData;
        const patch: DbRow = { match_reasoning: reasoning };
        if (req.status) {
          patch['status'] = req.status;
        }
        if (typeof applicationId === 'string') {
          await store.updateApplication(normUserId, applicationId, patch);
        }
      } else {
        let targetJobId =
          req.job_id !== null && req.job_id !== undefined && req.job_id
            ? toUuidStr(req.job_id)
            : null;
        if (!targetJobId && req.session_id) {
          const session = await store.getSession(normUserId, req.session_id);
          const sessionJobId = session?.['job_id'];
          if (typeof sessionJobId === 'string' && sessionJobId) {
            targetJobId = sessionJobId;
          }
        }

        if (targetJobId) {
          const status = req.status ?? (req.tech_score >= 4 ? 'shortlisted' : 'new');
          await store.insertApplication({
            id: randomUUID(),
            jobId: targetJobId,
            candidateId: normCandidateId,
            userId: normUserId,
            matchScore: (req.tech_score + req.comm_score) * 10,
            matchReasoning: { rubric: rubricData },
            status,
          });
        }
      }
    } catch (error) {
      logger.error(`[routes_evaluate] DB sync error for candidate rubric: ${errorMessage(error)}`);
      throw new HttpError(500, `Database error saving evaluation: ${errorMessage(error)}`);
    }

    // Deduct 1 analysis credit; a ledger failure never undoes the evaluation.
    try {
      await payment.consumeCredits(userId, 1, `Candidate rubric evaluation: ${req.candidate_id}`);
    } catch (error) {
      logger.warn(`Failed to deduct credit during candidate evaluation: ${errorMessage(error)}`);
    }

    return {
      status: 'success',
      message: `Evaluation for candidate '${req.candidate_id}' saved successfully.`,
      evaluation: evaluationPayload,
    };
  }

  async getEvaluation(candidateId: string, userId: string): Promise<DbRow> {
    const store = this.getStore();
    const normCandidateId = toUuidStr(candidateId);
    const normUserId = toUuidStr(userId);
    let foundStatus: unknown = null;

    try {
      const application = await store.getApplicationForCandidate(normUserId, normCandidateId);
      if (application) {
        if (application['status']) {
          foundStatus = application['status'];
        }
        const reasoning = asJsonObject(application['match_reasoning']);
        const rubric = reasoning['rubric'];
        if (rubric && typeof rubric === 'object' && !Array.isArray(rubric)) {
          const record = rubric as Record<string, unknown>;
          return {
            candidate_id: candidateId,
            user_id: userId,
            tech_score: record['tech_score'] ?? 0,
            comm_score: record['comm_score'] ?? 0,
            notes: record['notes'] ?? '',
            status: foundStatus,
            updated_at: record['updated_at'] ?? null,
          };
        }
      }

      const candidate = await store.getCandidate(normUserId, normCandidateId);
      if (candidate) {
        const metadata = asJsonObject(candidate['metadata']);
        if (!foundStatus && metadata['status']) {
          foundStatus = metadata['status'];
        }
        const rubric = metadata['rubric'];
        if (rubric && typeof rubric === 'object' && !Array.isArray(rubric)) {
          const record = rubric as Record<string, unknown>;
          return {
            candidate_id: candidateId,
            user_id: userId,
            tech_score: record['tech_score'] ?? 0,
            comm_score: record['comm_score'] ?? 0,
            notes: record['notes'] ?? '',
            status: foundStatus,
            updated_at: record['updated_at'] ?? null,
          };
        }
      }
    } catch (error) {
      logger.warn(
        `[routes_evaluate] DB lookup error for candidate ${candidateId}: ${errorMessage(error)}`,
      );
    }

    return {
      candidate_id: candidateId,
      user_id: userId,
      tech_score: 0,
      comm_score: 0,
      notes: '',
      status: foundStatus,
    };
  }

  async exportAts(req: ATSExportRequest, userId: string): Promise<DbRow | CsvExport> {
    const store = this.getStore();
    const normUserId = toUuidStr(userId);
    const evaluations = new Map<string, DbRow>();

    try {
      const candidates = await store.listCandidates(normUserId);
      for (const candidate of candidates) {
        const candidateId = candidate['id'];
        if (typeof candidateId !== 'string' || !candidateId) {
          continue;
        }
        const metadata = asJsonObject(candidate['metadata']);
        if (req.session_id) {
          const sessionIds = Array.isArray(metadata['session_ids']) ? metadata['session_ids'] : [];
          if (metadata['session_id'] !== req.session_id && !sessionIds.includes(req.session_id)) {
            continue;
          }
        }
        const rubric = asJsonObject(metadata['rubric']);
        evaluations.set(candidateId, {
          candidate_id: candidateId,
          candidate_name: candidate['full_name'] ?? 'Candidate',
          candidate_email: candidate['email'] ?? null,
          tech_score: rubric['tech_score'] ?? 0,
          comm_score: rubric['comm_score'] ?? 0,
          notes: rubric['notes'] ?? '',
          status: metadata['status'] ?? 'new',
          match_score: metadata['match_score'] ?? 0,
        });
      }

      const applications = await store.listApplications(normUserId);
      for (const application of applications) {
        const candidateId = application['candidate_id'];
        if (typeof candidateId !== 'string' || !candidateId) {
          continue;
        }
        if (req.session_id && !evaluations.has(candidateId)) {
          continue;
        }
        const reasoning = asJsonObject(application['match_reasoning']);
        const rubric = asJsonObject(reasoning['rubric']);
        const existing = evaluations.get(candidateId);
        if (existing) {
          if (rubric['tech_score']) {
            existing['tech_score'] = rubric['tech_score'];
          }
          if (rubric['comm_score']) {
            existing['comm_score'] = rubric['comm_score'];
          }
          if (rubric['notes']) {
            existing['notes'] = rubric['notes'];
          }
          if (application['status']) {
            existing['status'] = application['status'];
          }
          if (application['match_score'] !== null && application['match_score'] !== undefined) {
            existing['match_score'] = application['match_score'];
          }
        } else {
          evaluations.set(candidateId, {
            candidate_id: candidateId,
            candidate_name: 'Candidate',
            candidate_email: null,
            tech_score: rubric['tech_score'] ?? 0,
            comm_score: rubric['comm_score'] ?? 0,
            notes: rubric['notes'] ?? '',
            status: application['status'] ?? 'new',
            match_score: application['match_score'] ?? 0,
          });
        }
      }
    } catch (error) {
      logger.warn(`[routes_evaluate] ATS export DB query notice: ${errorMessage(error)}`);
    }

    if (req.format.toLowerCase() === 'csv') {
      let body = csvRow([
        'Candidate ID',
        'Candidate Name',
        'Email',
        'Status',
        'Match Score',
        'Tech Score',
        'Comm Score',
        'Notes',
      ]);
      for (const [candidateId, evaluation] of evaluations) {
        body += csvRow([
          evaluation['candidate_id'] ?? candidateId,
          evaluation['candidate_name'] ?? 'Candidate',
          evaluation['candidate_email'] ?? '',
          evaluation['status'] ?? 'new',
          evaluation['match_score'] ?? 0,
          evaluation['tech_score'] ?? 0,
          evaluation['comm_score'] ?? 0,
          String(evaluation['notes'] ?? '').replaceAll('\n', ' '),
        ]);
      }
      return { contentType: 'text/csv', filename: 'ats_export.csv', body };
    }

    return {
      status: 'success',
      format: req.format,
      export_timestamp: this.now().toISOString(),
      evaluations_count: evaluations.size,
      evaluations: Object.fromEntries(evaluations),
    };
  }

  async updateStatus(
    candidateId: string,
    req: CandidateStatusRequest,
    userId: string,
  ): Promise<DbRow> {
    // AI-SEC-6: GDPR Art. 22 human-in-the-loop guard.
    if (
      req.actor === 'automated_agent' &&
      ['rejected', 'disqualified'].includes(req.status.toLowerCase())
    ) {
      throw new HttpError(
        403,
        'GDPR Art. 22 Violation: Adverse automated hiring decisions prohibited. ' +
          'Candidate rejection requires explicit authenticated human recruiter action.',
      );
    }

    const nowIso = this.now().toISOString();
    const store = this.getStore();
    const normCandidateId = toUuidStr(candidateId);
    const normUserId = toUuidStr(userId);

    try {
      const candidate = await store.getCandidate(normUserId, normCandidateId);
      if (candidate) {
        const metadata = asJsonObject(candidate['metadata']);
        metadata['status'] = req.status;
        metadata['status_updated_at'] = nowIso;
        if (req.session_id) {
          metadata['session_id'] = req.session_id;
          const sessionIds = new Set<unknown>(
            Array.isArray(metadata['session_ids']) ? metadata['session_ids'] : [],
          );
          sessionIds.add(req.session_id);
          metadata['session_ids'] = [...sessionIds];
        }
        await store.updateCandidateMetadata(normUserId, normCandidateId, metadata);
      } else {
        const stubMetadata: DbRow = { status: req.status, status_updated_at: nowIso };
        if (req.session_id) {
          stubMetadata['session_id'] = req.session_id;
          stubMetadata['session_ids'] = [req.session_id];
        }
        await store.insertCandidate({
          id: normCandidateId,
          userId: normUserId,
          fullName: `Candidate ${candidateId}`,
          email: `${candidateId}@recruitai.local`,
          rawResumeText: '',
          metadata: stubMetadata,
        });
      }

      await store.updateApplicationStatusForCandidate(normUserId, normCandidateId, req.status);

      return {
        status: 'success',
        candidate_id: candidateId,
        candidate_status: req.status,
        new_status: req.status,
      };
    } catch (error) {
      logger.error(`[routes_evaluate] Error updating candidate status: ${errorMessage(error)}`);
      throw new HttpError(500, `Database error updating status: ${errorMessage(error)}`);
    }
  }
}

/** Factory used by the API router and tests. */
export function createEvaluationService(options: EvaluationServiceOptions = {}): EvaluationService {
  return new EvaluationService(options);
}
