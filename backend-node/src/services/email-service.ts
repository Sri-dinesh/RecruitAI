import { randomUUID } from 'node:crypto';

import { getConfig, type AppConfig } from '../config/index.js';
import {
  createOutreachStore,
  type OutreachLogInsert,
  type OutreachLogRecord,
  type OutreachStore,
  type OutreachTimestamp,
} from '../db/outreach-store.js';
import type {
  EmailRequest,
  EmailResponse,
  OutreachHistoryResponse,
  OutreachLogItem,
  OutreachStatsResponse,
} from '../schemas/email.js';
import { createPaymentService, type PaymentService } from './payment-service.js';
import { sendEmailDraft } from '../tools/email-tool.js';
import { createLogger } from '../telemetry/logger.js';
import { HttpError, InsufficientCreditsError, OUTREACH_QUOTA_MESSAGE } from '../types/errors.js';

const logger = createLogger('recruitai.email');

/**
 * Port of `backend/app/api/routes_email.py`.
 *
 * Preserved behavior:
 * - HTTP 402 with the structured `INSUFFICIENT_CREDITS` outreach body when the
 *   recruiter has no credits;
 * - SMTP/simulated dispatch classification from the tool result string;
 * - one-credit deduction after dispatch (best effort, never blocks the log);
 * - failed SMTP dispatches are logged and returned as a 500;
 * - tenant-scoped history (newest first, optional candidate filter, max 100)
 *   and status statistics.
 */

export type EmailSender = (emailDraft: string, recipientEmail: string) => Promise<string>;

export interface EmailServiceOptions {
  readonly config?: AppConfig;
  readonly paymentService?: PaymentService;
  readonly store?: OutreachStore;
  /** Dispatch injection for tests; defaults to `sendEmailDraft`. */
  readonly sendEmailDraft?: EmailSender;
  /** Injectable clock for audit timestamps. */
  readonly now?: () => Date;
}

export interface EmailSubjectAndBody {
  readonly subject: string;
  readonly body: string;
  readonly draft: string;
}

/**
 * Parses the request into the subject/body pair and the full draft sent to the
 * transport. Mirrors `_extract_subject_and_body` exactly, including the
 * explicit-field precedence over a `Subject:` line in the draft.
 */
export function extractSubjectAndBody(req: EmailRequest): EmailSubjectAndBody {
  let draft = req.email_draft || '';
  if (!draft && req.subject && req.body) {
    draft = `Subject: ${req.subject}\n\n${req.body}`;
  } else if (!draft) {
    draft = `Subject: ${req.subject || 'RecruitAI Outreach'}\n\n${req.body || ''}`;
  }

  const lines = draft.split('\n');
  const subjectLine = lines.find((line) => line.toLowerCase().startsWith('subject:')) ?? null;

  let subject: string;
  if (req.subject) {
    subject = req.subject.trim();
  } else if (subjectLine) {
    subject = subjectLine.slice('subject:'.length).trim();
  } else {
    subject = 'RecruitAI Outreach';
  }

  let body: string;
  if (req.body) {
    body = req.body.trim();
  } else if (subjectLine) {
    body = lines
      .filter((line) => !line.toLowerCase().startsWith('subject:'))
      .join('\n')
      .trim();
  } else {
    body = draft.trim();
  }

  return { subject, body, draft };
}

export class EmailService {
  private readonly config: AppConfig;
  private readonly paymentService: PaymentService;
  private readonly now: () => Date;
  private readonly sender: EmailSender;
  private store: OutreachStore | undefined;

  constructor(options: EmailServiceOptions = {}) {
    this.config = options.config ?? getConfig();
    this.paymentService = options.paymentService ?? createPaymentService({ config: this.config });
    this.store = options.store;
    this.now = options.now ?? (() => new Date());
    this.sender =
      options.sendEmailDraft ??
      ((draft, recipient) => sendEmailDraft(draft, recipient, { config: this.config }));
  }

  private getStore(): OutreachStore {
    this.store ??= createOutreachStore({ config: this.config });
    return this.store;
  }

  async sendEmail(req: EmailRequest, userId: string): Promise<EmailResponse> {
    // 1. Candidate outreach quota (structured 402 body, as in Python).
    const currentCredits = await this.paymentService.getUserCredits(userId);
    if (currentCredits <= 0) {
      throw new InsufficientCreditsError(OUTREACH_QUOTA_MESSAGE);
    }

    const { subject, body, draft } = extractSubjectAndBody(req);

    // 2. Dispatch through the tool.
    let result: string;
    try {
      result = await this.sender(draft, req.recipient_email);
    } catch (error) {
      const refId = randomUUID().replaceAll('-', '').slice(0, 8);
      logger.error(
        `[email ref=${refId}] Failed to dispatch email to ${req.recipient_email}: ${errorMessage(error)}`,
      );
      throw new HttpError(
        500,
        `Email dispatch failed. Please contact support with reference ref=${refId}`,
      );
    }

    // 3. Classify the dispatch outcome from the tool's status string.
    const isSmtpSuccess = result.includes('Email sent successfully via SMTP');
    const isSmtpFailed = result.includes('Failed to send email via SMTP');

    let dispatchStatus: string;
    let dispatchType: string;
    let errorMsg: string | null;

    if (isSmtpFailed) {
      dispatchStatus = 'failed';
      dispatchType = 'smtp';
      errorMsg = result;
    } else if (isSmtpSuccess) {
      dispatchStatus = 'sent';
      dispatchType = 'smtp';
      errorMsg = null;
    } else {
      dispatchStatus = 'simulated';
      dispatchType = 'simulated';
      errorMsg = null;
    }

    // Failed SMTP dispatches are logged and surfaced as a 500.
    if (isSmtpFailed) {
      try {
        await this.getStore().insertLog(
          this.buildLog({
            userId,
            req,
            subject,
            body,
            status: 'failed',
            errorMessage: errorMsg,
          }),
        );
      } catch {
        // Python swallows this insert failure.
      }

      throw new HttpError(500, `SMTP dispatch failure: ${result}`);
    }

    // 4. Deduct one credit for successful outreach (best effort).
    let updatedCredits = currentCredits;
    try {
      const consumption = await this.paymentService.consumeCredits(
        userId,
        1,
        `Candidate outreach email to ${req.recipient_email}`,
      );
      updatedCredits = consumption.credits_remaining ?? currentCredits - 1;
    } catch (error) {
      logger.warn(`Credit consumption notice during email dispatch: ${errorMessage(error)}`);
    }

    // 5. Persist the audit log (best effort).
    const logId = randomUUID();
    try {
      await this.getStore().insertLog({
        id: logId,
        userId,
        candidateId: req.candidate_id ?? null,
        recipientEmail: req.recipient_email,
        subject,
        body,
        templateId: req.template_id ?? null,
        status: dispatchStatus,
        errorMessage: errorMsg,
        createdAt: this.now(),
      });
    } catch (error) {
      logger.warn(`Failed to persist outreach log to database: ${errorMessage(error)}`);
    }

    return {
      status: result,
      log_id: logId,
      dispatch_type: dispatchType,
      credits_remaining: updatedCredits,
    };
  }

  async getHistory(
    userId: string,
    candidateId: string | null = null,
    limit = 50,
  ): Promise<OutreachHistoryResponse> {
    try {
      const filter = candidateId ? candidateId : null;
      const records = await this.getStore().listLogs(userId, filter, limit);
      const items = records.map(mapOutreachLog);
      return { total: items.length, items };
    } catch (error) {
      logger.error(`Failed to fetch outreach history for user ${userId}: ${errorMessage(error)}`);
      return { total: 0, items: [] };
    }
  }

  async getStats(userId: string): Promise<OutreachStatsResponse> {
    try {
      const statuses = await this.getStore().listStatuses(userId);
      return {
        total_sent: statuses.length,
        smtp_count: statuses.filter((status) => status === 'sent').length,
        simulated_count: statuses.filter((status) => status === 'simulated').length,
        failed_count: statuses.filter((status) => status === 'failed').length,
      };
    } catch (error) {
      logger.error(`Failed to fetch outreach stats for user ${userId}: ${errorMessage(error)}`);
      return { total_sent: 0, smtp_count: 0, simulated_count: 0, failed_count: 0 };
    }
  }

  private buildLog(input: {
    userId: string;
    req: EmailRequest;
    subject: string;
    body: string;
    status: string;
    errorMessage: string | null;
  }): OutreachLogInsert {
    return {
      id: randomUUID(),
      userId: input.userId,
      candidateId: input.req.candidate_id ?? null,
      recipientEmail: input.req.recipient_email,
      subject: input.subject,
      body: input.body,
      templateId: input.req.template_id ?? null,
      status: input.status,
      errorMessage: input.errorMessage,
      createdAt: this.now(),
    };
  }
}

/** Process-wide service; routes use the instance created by `createApp`. */
export function createEmailService(options: EmailServiceOptions = {}): EmailService {
  return new EmailService(options);
}

function mapOutreachLog(record: OutreachLogRecord): OutreachLogItem {
  return {
    id: String(record.id),
    user_id: String(record.userId),
    candidate_id: record.candidateId ?? null,
    recipient_email: String(record.recipientEmail),
    subject: String(record.subject),
    body: String(record.body),
    template_id: record.templateId ?? null,
    status: String(record.status),
    error_message: record.errorMessage ?? null,
    created_at: toIsoString(record.createdAt) ?? '',
  };
}

function toIsoString(value: OutreachTimestamp | null): string | null {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
