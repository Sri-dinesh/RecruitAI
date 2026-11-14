import nodemailer from 'nodemailer';

import { getConfig, type AppConfig, type SmtpConfig } from '../config/index.js';
import { callLlm } from '../llm/router.js';

/**
 * Port of `backend/app/tools/email_tool.py`.
 *
 * Preserved behavior:
 * - `draftRecruiterEmail` asks the LLM pool for a subject/body/signature draft
 *   and falls back to the same action-specific template when every provider
 *   fails;
 * - `sendEmailDraft` sends through SMTP only when `SMTP_USERNAME` and
 *   `SMTP_PASSWORD` are configured, parses the `Subject:` line the same way,
 *   and otherwise simulates the dispatch with a PII-masked recipient;
 * - the confirmation/failure strings are byte-for-byte the ones the route uses
 *   to classify `dispatch_type` and `status`.
 *
 * Nodemailer replaces Python's `smtplib`; the transport is injectable so tests
 * never open a network connection.
 */

export interface EmailMessage {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<unknown>;
}

export interface SendEmailDraftOptions {
  readonly config?: AppConfig;
  /** Explicit transport (tests); otherwise created from the SMTP config. */
  readonly transport?: EmailTransport;
  /** Simulated-mode stdout sink; injectable for assertions. */
  readonly log?: (message: string) => void;
}

export interface DraftRecruiterEmailOptions {
  readonly config?: AppConfig;
  /** LLM call injection for tests; defaults to the rotating router. */
  readonly callLlmImpl?: typeof callLlm;
}

/** Python `str.title()`: capitalise after every non-letter, lowercase the rest. */
function pythonTitle(value: string): string {
  let result = '';
  let previousWasLetter = false;
  for (const char of value) {
    const isLetter = /[A-Za-z]/.test(char);
    result += isLetter ? (previousWasLetter ? char.toLowerCase() : char.toUpperCase()) : char;
    previousWasLetter = isLetter;
  }
  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const FALLBACK_ACTION_LINES: Readonly<Record<string, (role: string) => string>> = {
  'interview invite': (role) =>
    `We'd like to invite you for an interview for the ${role} position.`,
  rejection: (role) =>
    `After careful consideration, we regret to inform you that we will not be moving forward with your application for the ${role} role.`,
  offer: (role) => `We are delighted to extend an offer for the ${role} position.`,
};

/** Template fallback used both by the LLM failure path and graph callers. */
export function fallbackRecruiterEmail(
  candidateName: string,
  role: string,
  action: string,
  error: unknown,
): string {
  const actionLine =
    FALLBACK_ACTION_LINES[action.toLowerCase()]?.(role) ??
    `We are reaching out regarding your application for the ${role} role.`;

  return (
    `Subject: ${pythonTitle(action)} - ${role} Position\n\n` +
    `Dear ${candidateName},\n\n` +
    `${actionLine}\n\n` +
    `Please feel free to reach out if you have any questions.\n\n` +
    `Best regards,\n` +
    `The Recruiting Team\n\n` +
    `[Note: Draft generated using template fallback due to: ${errorMessage(error)}]`
  );
}

/**
 * Draft a recruiter email for a candidate.
 *
 * The LLM draft is trimmed; any provider/kill-switch failure falls back to the
 * Python template so chat flows never lose the response.
 */
export async function draftRecruiterEmail(
  candidateName: string,
  role: string,
  action: string,
  options: DraftRecruiterEmailOptions = {},
): Promise<string> {
  const systemInstruction =
    'You are a professional technical recruiter writing concise, warm, and professional emails. ' +
    'Draft a recruiter email for the given candidate and action. ' +
    'Include: Subject line, greeting, body, and professional sign-off. ' +
    'Keep it under 200 words. Be specific to the action type.';
  const prompt =
    `Write a '${action}' email for candidate **${candidateName}** ` +
    `who applied for the **${role}** role.\n\n` +
    'Return the full email text including Subject, Body, and Signature.';

  const invoke = options.callLlmImpl ?? callLlm;

  try {
    const response = await invoke(prompt, {
      systemInstruction,
      jsonMode: false,
      ...(options.config === undefined ? {} : { config: options.config }),
    });
    return response.text.trim();
  } catch (error) {
    return fallbackRecruiterEmail(candidateName, role, action, error);
  }
}

/** `re.sub(r"(?<=.{2}).(?=.*@)", "*", recipient_email)` from Python. */
export function maskRecipientEmail(email: string): string {
  return email.replace(/(?<=.{2}).(?=.*@)/g, '*');
}

/** Parse the same subject/body the SMTP path sends. */
export function parseDraft(emailDraft: string): { subject: string; body: string } {
  let subject = 'RecruitAI Outreach';
  let body = emailDraft;

  const lines = emailDraft.split('\n');
  const subjectLine = lines.find((line) => line.toLowerCase().startsWith('subject:'));
  if (subjectLine) {
    subject = subjectLine.slice('subject:'.length).trim();
    body = lines
      .filter((line) => !line.toLowerCase().startsWith('subject:'))
      .join('\n')
      .trim();
  }

  return { subject, body };
}

function createSmtpTransport(config: SmtpConfig): EmailTransport {
  const transporter = nodemailer.createTransport({
    host: config.server,
    port: config.port,
    secure: false,
    requireTLS: true,
    auth: {
      user: config.username,
      pass: config.password,
    },
  });

  return {
    send: (message) => transporter.sendMail(message),
  };
}

/**
 * Send (or simulate) an email draft.
 *
 * Never throws for SMTP problems: the Python tool returns the failure text and
 * the route converts it into the 500 `SMTP dispatch failure:` response.
 */
export async function sendEmailDraft(
  emailDraft: string,
  recipientEmail = 'candidate@example.com',
  options: SendEmailDraftOptions = {},
): Promise<string> {
  const config = options.config ?? getConfig();
  const { smtp } = config;
  const log = options.log ?? ((message: string) => console.log(message));

  if (smtp.username && smtp.password) {
    try {
      const { subject, body } = parseDraft(emailDraft);
      const transport = options.transport ?? createSmtpTransport(smtp);
      const sender = smtp.sender || smtp.username;

      await transport.send({
        from: sender,
        to: recipientEmail,
        subject,
        text: body,
      });

      return (
        '✅ **Email sent successfully via SMTP!**\n' +
        `Recipient: \`${recipientEmail}\`\n` +
        `Subject: \`${subject}\`\n` +
        `Server: \`${smtp.server}:${smtp.port}\``
      );
    } catch (error) {
      return (
        `❌ **Failed to send email via SMTP:** ${errorMessage(error)}\n` +
        `Recipient: \`${recipientEmail}\``
      );
    }
  }

  // SMTP fallback: simulate without leaking candidate PII to container logs.
  const maskedEmail = maskRecipientEmail(recipientEmail);
  log(`[EMAIL STUB] Simulated outreach to ${maskedEmail}`);

  return (
    'ℹ️ **Simulated outreach dispatch (SMTP simulation mode).**\n' +
    `Recipient: \`${maskedEmail}\`\n` +
    'Status: Recorded in hiring campaign.'
  );
}
