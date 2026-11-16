import type { AppConfig } from '../config/index.js';
import {
  createWorkspaceQueryStore,
  type DbRow,
  type WorkspaceQueryStore,
} from '../db/workspace-query-store.js';
import { pythonRound } from './parsing-utils.js';
import { createLogger } from '../telemetry/logger.js';
import { HttpError } from '../types/errors.js';

const logger = createLogger('recruitai.retention');

/** Port of `backend/app/services/retention.py` and the bias audit in `routes_privacy.py`. */

export interface PrivacyServiceOptions {
  readonly config?: AppConfig;
  readonly queryStore?: WorkspaceQueryStore;
  readonly now?: () => Date;
}

export interface RetentionSummary {
  raw_resumes_cleared: number;
  chat_messages_purged: number;
}

export interface BiasAuditInsufficient {
  audit_timestamp: string;
  law_compliance: 'NYC Local Law 144 (AEDT)';
  sample_size: 0;
  status: 'insufficient_data';
  message: string;
}

export interface BiasAuditResult {
  audit_timestamp: string;
  law_compliance: 'NYC Local Law 144 (AEDT)';
  sample_size: number;
  metrics: {
    mean_score: number;
    std_deviation: number;
    median_score: number;
    p20_score: number;
    p80_score: number;
    selection_rate: number;
    impact_ratio: number;
    adverse_impact_flagged: boolean;
  };
  score_distribution: Record<'0-20' | '21-40' | '41-60' | '61-80' | '81-100', number>;
  certification: {
    audited_by: 'RecruitAI Autonomous AEDT Auditor';
    compliant_with_four_fifths_rule: boolean;
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isoSeconds(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

function pick(row: DbRow, keys: readonly string[]): DbRow {
  const result: DbRow = {};
  for (const key of keys) {
    result[key] = row[key] ?? null;
  }
  return result;
}

export class PrivacyService {
  private readonly config: AppConfig | undefined;
  private store: WorkspaceQueryStore | undefined;
  private readonly now: () => Date;

  constructor(options: PrivacyServiceOptions = {}) {
    this.config = options.config;
    this.store = options.queryStore;
    this.now = options.now ?? (() => new Date());
  }

  private getStore(): WorkspaceQueryStore {
    this.store ??= createWorkspaceQueryStore(
      this.config === undefined ? {} : { config: this.config },
    );
    return this.store;
  }

  /** GDPR Art. 17 candidate erasure cascade. */
  async purgeCandidate(candidateId: string, userId: string): Promise<boolean> {
    const store = this.getStore();
    try {
      const existing = await store.getCandidate(userId, candidateId);
      if (!existing) {
        return false;
      }

      // session_candidates -> interviews -> applications -> resume_chunks -> candidates
      try {
        await store.deleteSessionCandidatesForCandidate(candidateId);
      } catch (error) {
        logger.warn(`[retention] session_candidates purge notice: ${errorMessage(error)}`);
      }
      await store.deleteInterviewsForCandidate(userId, candidateId);
      await store.deleteApplicationsForCandidate(userId, candidateId);
      await store.deleteResumeChunksForCandidate(userId, candidateId);
      await store.deleteCandidate(userId, candidateId);

      logger.info(
        `[AUDIT] [GDPR_ERASURE] candidate_id=${candidateId} user_id=${userId} status=purged`,
      );
      return true;
    } catch (error) {
      logger.error(`[retention] Failed to purge candidate ${candidateId}: ${errorMessage(error)}`);
      throw error;
    }
  }

  /** GDPR Art. 15/20 candidate access + portability export. */
  async exportCandidateData(candidateId: string, userId: string): Promise<DbRow> {
    const store = this.getStore();
    try {
      const candidate = await store.getCandidate(userId, candidateId);
      if (!candidate) {
        return {};
      }

      const applications = await store.listApplicationsForCandidate(userId, candidateId);
      const interviews = await store.listInterviewsForCandidate(userId, candidateId);
      const chunks = await store.countResumeChunks(userId, candidateId);

      return {
        candidate,
        applications: applications.map((application) =>
          pick(application, [
            'job_id',
            'match_score',
            'match_reasoning',
            'status',
            'created_at',
            'updated_at',
          ]),
        ),
        interviews: interviews.map((interview) =>
          pick(interview, [
            'scheduled_at',
            'duration_minutes',
            'mode',
            'status',
            'feedback',
            'meeting_link',
            'created_at',
          ]),
        ),
        vector_chunks_stored: chunks,
        export_metadata: {
          generated_at: this.now().toISOString(),
          gdpr_compliance: 'Articles 15 & 20',
          tenant_user_id: userId,
        },
      };
    } catch (error) {
      logger.error(
        `[retention] Failed to export data for candidate ${candidateId}: ${errorMessage(error)}`,
      );
      throw error;
    }
  }

  /** AI-SEC-3 tiered retention: raw resume text and chat message TTLs. */
  async enforceRetentionPolicy(
    userId: string | undefined,
    rawResumeTtlDays = 90,
    chatTtlDays = 365,
  ): Promise<RetentionSummary> {
    const store = this.getStore();
    const summary: RetentionSummary = { raw_resumes_cleared: 0, chat_messages_purged: 0 };
    const now = this.now();
    const resumeCutoff = new Date(now.getTime() - rawResumeTtlDays * 86_400_000).toISOString();
    const chatCutoff = new Date(now.getTime() - chatTtlDays * 86_400_000).toISOString();

    try {
      summary.raw_resumes_cleared = await store.clearRawResumeTextBefore(userId, resumeCutoff);
      summary.chat_messages_purged = await store.deleteChatMessagesBefore(userId, chatCutoff);
      logger.info(`[retention] Automated retention run complete: ${JSON.stringify(summary)}`);
    } catch (error) {
      logger.warn(
        `[retention] Automated retention policy encountered notice: ${errorMessage(error)}`,
      );
    }

    return summary;
  }

  /** GDPR Art. 15/20 recruiter export. */
  async exportUserData(userId: string): Promise<DbRow> {
    const store = this.getStore();
    const user = (await store.getUser(userId)) ?? { id: userId };
    const sessions = await store.listSessions(userId);
    const candidates = await store.listCandidates(userId);

    return {
      export_metadata: {
        law_compliance: 'GDPR Art. 15 (Right of Access) & Art. 20 (Data Portability)',
        user_id: userId,
        exported_at: this.now().toISOString(),
      },
      user_profile: user,
      campaign_sessions_count: sessions.length,
      campaign_sessions: sessions.map((session) =>
        pick(session, ['id', 'title', 'created_at', 'updated_at']),
      ),
      candidates_count: candidates.length,
      candidates: candidates.map((candidate) => pick(candidate, ['id', 'full_name', 'created_at'])),
    };
  }

  /** GDPR Art. 17 recruiter account erasure. */
  async purgeUserAccount(userId: string): Promise<boolean> {
    await this.getStore().purgeUserAccount(userId);
    logger.info(`[AUDIT] [GDPR_ACCOUNT_ERASURE] user_id=${userId} status=account_purged`);
    return true;
  }

  /** NYC Local Law 144 (AEDT) bias audit. */
  async biasAudit(userId: string): Promise<BiasAuditInsufficient | BiasAuditResult> {
    try {
      const store = this.getStore();
      const applications = await store.listApplications(userId);
      const scores = applications
        .map((application) => application['match_score'])
        .filter((score): score is number | string => score !== null && score !== undefined)
        .map((score) => Number(score))
        .filter((score) => Number.isFinite(score));

      const totalCandidates = scores.length;
      const timestamp = isoSeconds(this.now());
      if (totalCandidates === 0) {
        return {
          audit_timestamp: timestamp,
          law_compliance: 'NYC Local Law 144 (AEDT)',
          sample_size: 0,
          status: 'insufficient_data',
          message: 'No evaluated candidate applications found for bias audit.',
        };
      }

      scores.sort((left, right) => left - right);
      const meanScore = scores.reduce((total, score) => total + score, 0) / totalCandidates;
      const variance =
        scores.reduce((total, score) => total + (score - meanScore) ** 2, 0) / totalCandidates;
      const stdDev = Math.sqrt(variance);
      const median = scores[Math.trunc(totalCandidates / 2)] ?? 0;
      const p20 = scores[Math.trunc(totalCandidates * 0.2)] ?? 0;
      const p80 = scores[Math.trunc(totalCandidates * 0.8)] ?? 0;

      const buckets = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
      for (const score of scores) {
        if (score <= 20) {
          buckets['0-20'] += 1;
        } else if (score <= 40) {
          buckets['21-40'] += 1;
        } else if (score <= 60) {
          buckets['41-60'] += 1;
        } else if (score <= 80) {
          buckets['61-80'] += 1;
        } else {
          buckets['81-100'] += 1;
        }
      }

      const shortlistedCount = applications.filter((application) =>
        ['shortlisted', 'offered'].includes(String(application['status'] ?? '')),
      ).length;
      const selectionRate = pythonRound(shortlistedCount / totalCandidates, 4);
      const impactRatio = pythonRound(p20 / Math.max(1, p80), 3);
      const adverseImpactFlagged = impactRatio < 0.8;

      return {
        audit_timestamp: timestamp,
        law_compliance: 'NYC Local Law 144 (AEDT)',
        sample_size: totalCandidates,
        metrics: {
          mean_score: pythonRound(meanScore, 2),
          std_deviation: pythonRound(stdDev, 2),
          median_score: pythonRound(median, 2),
          p20_score: pythonRound(p20, 2),
          p80_score: pythonRound(p80, 2),
          selection_rate: selectionRate,
          impact_ratio: impactRatio,
          adverse_impact_flagged: adverseImpactFlagged,
        },
        score_distribution: buckets,
        certification: {
          audited_by: 'RecruitAI Autonomous AEDT Auditor',
          compliant_with_four_fifths_rule: !adverseImpactFlagged,
        },
      };
    } catch (error) {
      logger.error(`[bias_audit] Error generating bias audit: ${errorMessage(error)}`);
      throw new HttpError(500, `Failed to generate bias audit: ${errorMessage(error)}`);
    }
  }
}

/** Factory used by the API router and tests. */
export function createPrivacyService(options: PrivacyServiceOptions = {}): PrivacyService {
  return new PrivacyService(options);
}
