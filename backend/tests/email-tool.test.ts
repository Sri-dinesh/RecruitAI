import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadConfig, type AppConfig } from '../src/config/index.js';
import type { LlmResponse } from '../src/llm/gemini.js';
import {
  draftRecruiterEmail,
  fallbackRecruiterEmail,
  maskRecipientEmail,
  parseDraft,
  sendEmailDraft,
  type EmailTransport,
} from '../src/tools/email-tool.js';

function config(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({
    SMTP_SERVER: 'smtp.test',
    SMTP_PORT: '2525',
    SMTP_USERNAME: '',
    SMTP_PASSWORD: '',
    SMTP_SENDER: '',
    ...overrides,
  });
}

function smtpConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return config({
    SMTP_SERVER: 'smtp.test',
    SMTP_PORT: '2525',
    SMTP_USERNAME: 'mailer@example.com',
    SMTP_PASSWORD: 'secret',
    ...overrides,
  });
}

function unusedTransport(): EmailTransport {
  return {
    async send() {
      throw new Error('transport should not be used');
    },
  };
}

describe('draftRecruiterEmail', () => {
  it('returns the trimmed LLM draft', async () => {
    let prompt = '';
    let systemInstruction: string | undefined;
    let jsonMode: boolean | undefined;

    const response: LlmResponse = {
      content: '  Subject: Interview Invite\n\nDear Ada, welcome.  ',
    };
    const draft = await draftRecruiterEmail('Ada Lovelace', 'Senior Engineer', 'interview invite', {
      callLlmImpl: async (input, options) => {
        prompt = input;
        systemInstruction = options?.systemInstruction;
        jsonMode = options?.jsonMode;
        return { text: String(response.content), provider: 'gemini', latencyMs: 12 };
      },
    });

    assert.equal(draft, 'Subject: Interview Invite\n\nDear Ada, welcome.');
    assert.match(prompt, /Write a 'interview invite' email/);
    assert.match(prompt, /\*\*Ada Lovelace\*\*/);
    assert.match(prompt, /\*\*Senior Engineer\*\*/);
    assert.match(systemInstruction ?? '', /professional technical recruiter/);
    assert.equal(jsonMode, false);
  });

  it('falls back to the action-specific template when the LLM fails', async () => {
    const draft = await draftRecruiterEmail('Ada Lovelace', 'Senior Engineer', 'interview invite', {
      callLlmImpl: async () => {
        throw new Error('all providers failed');
      },
    });

    assert.equal(
      draft,
      'Subject: Interview Invite - Senior Engineer Position\n\n' +
        'Dear Ada Lovelace,\n\n' +
        "We'd like to invite you for an interview for the Senior Engineer position.\n\n" +
        'Please feel free to reach out if you have any questions.\n\n' +
        'Best regards,\n' +
        'The Recruiting Team\n\n' +
        '[Note: Draft generated using template fallback due to: all providers failed]',
    );
  });

  it('uses the correct fallback line for rejection, offer and unknown actions', () => {
    const rejection = fallbackRecruiterEmail('Ada', 'Engineer', 'rejection', new Error('x'));
    assert.match(
      rejection,
      /After careful consideration, we regret to inform you that we will not be moving forward/,
    );
    assert.match(rejection, /Subject: Rejection - Engineer Position/);

    const offer = fallbackRecruiterEmail('Ada', 'Engineer', 'OFFER', new Error('x'));
    assert.match(offer, /We are delighted to extend an offer for the Engineer position\./);
    assert.match(offer, /Subject: Offer - Engineer Position/);

    const generic = fallbackRecruiterEmail('Ada', 'Engineer', 'check in', new Error('x'));
    assert.match(generic, /We are reaching out regarding your application for the Engineer role\./);
    assert.match(generic, /Subject: Check In - Engineer Position/);
  });
});

describe('maskRecipientEmail', () => {
  it('masks every character after the first two that has an @ later', () => {
    assert.equal(maskRecipientEmail('alice@example.com'), 'al***@example.com');
    assert.equal(maskRecipientEmail('ab@example.com'), 'ab@example.com');
    assert.equal(maskRecipientEmail('a@b.co'), 'a@b.co');
    assert.equal(maskRecipientEmail('john.doe+tag@example.com'), 'jo**********@example.com');
  });
});

describe('parseDraft', () => {
  it('extracts a case-insensitive subject and removes every subject line', () => {
    assert.deepEqual(parseDraft('SUBJECT: Hello there\n\nBody line\nSubject: second'), {
      subject: 'Hello there',
      body: 'Body line',
    });
  });

  it('defaults the subject and preserves the draft when no subject line exists', () => {
    assert.deepEqual(parseDraft('  Dear Ada, welcome.  '), {
      subject: 'RecruitAI Outreach',
      body: '  Dear Ada, welcome.  ',
    });
  });
});

describe('sendEmailDraft simulation', () => {
  it('masks the recipient, logs the stub, and returns the simulation string', async () => {
    const logs: string[] = [];
    const result = await sendEmailDraft('Subject: Hello\n\nBody', 'alice@example.com', {
      config: config(),
      transport: unusedTransport(),
      log: (message) => logs.push(message),
    });

    assert.deepEqual(logs, ['[EMAIL STUB] Simulated outreach to al***@example.com']);
    assert.equal(
      result,
      'ℹ️ **Simulated outreach dispatch (SMTP simulation mode).**\n' +
        'Recipient: `al***@example.com`\n' +
        'Status: Recorded in hiring campaign.',
    );
  });

  it('never uses SMTP unless both username and password are configured', async () => {
    for (const overrides of [
      { SMTP_USERNAME: '', SMTP_PASSWORD: '' },
      { SMTP_USERNAME: 'mailer@example.com', SMTP_PASSWORD: '' },
      { SMTP_USERNAME: '', SMTP_PASSWORD: 'secret' },
    ]) {
      const result = await sendEmailDraft('Body', 'bob@example.com', {
        config: config(overrides),
        transport: unusedTransport(),
        log: () => undefined,
      });
      assert.match(result, /Simulated outreach dispatch/);
    }
  });
});

describe('sendEmailDraft SMTP', () => {
  it('sends the parsed subject/body and returns the exact success string', async () => {
    const messages: Array<Record<string, unknown>> = [];
    const transport: EmailTransport = {
      async send(message) {
        messages.push(message as unknown as Record<string, unknown>);
      },
    };

    const result = await sendEmailDraft('Subject: Interview\n\nDear Ada,', 'ada@example.com', {
      config: smtpConfig({ SMTP_SENDER: 'team@example.com' }),
      transport,
    });

    assert.deepEqual(messages, [
      {
        from: 'team@example.com',
        to: 'ada@example.com',
        subject: 'Interview',
        text: 'Dear Ada,',
      },
    ]);
    assert.equal(
      result,
      '✅ **Email sent successfully via SMTP!**\n' +
        'Recipient: `ada@example.com`\n' +
        'Subject: `Interview`\n' +
        'Server: `smtp.test:2525`',
    );
  });

  it('falls back to SMTP_USERNAME when SMTP_SENDER is unset', async () => {
    let from = '';
    await sendEmailDraft('Body', 'ada@example.com', {
      config: smtpConfig({ SMTP_SENDER: '' }),
      transport: {
        async send(message) {
          from = message.from;
        },
      },
    });
    assert.equal(from, 'mailer@example.com');
  });

  it('returns the exact failure string instead of throwing', async () => {
    const result = await sendEmailDraft('Body', 'ada@example.com', {
      config: smtpConfig(),
      transport: {
        async send() {
          throw new Error('connection refused');
        },
      },
    });

    assert.equal(
      result,
      '❌ **Failed to send email via SMTP:** connection refused\n' + 'Recipient: `ada@example.com`',
    );
  });
});
