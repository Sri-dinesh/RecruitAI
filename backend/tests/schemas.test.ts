import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { z } from 'zod';

import {
  analyticsDaysQuerySchema,
  analyticsLimitQuerySchema,
  analyticsSummarySchema,
  analyticsTopNQuerySchema,
  atsExportRequestSchema,
  candidateEvaluationRequestSchema,
  candidateSchema,
  candidateStatusRequestSchema,
  chatQuerySchema,
  chatRequestSchema,
  consumeCreditRequestSchema,
  createOrderRequestSchema,
  emailHistoryQuerySchema,
  emailRequestSchema,
  formatZodIssues,
  ingestFormSchema,
  jobDescriptionSchema,
  outreachStatsResponseSchema,
  patchSessionRequestSchema,
  pipelineStageSchema,
  pricingPlanSchema,
  reportRequestSchema,
  retentionRunRequestSchema,
  serializeResponse,
  userProfileResponseSchema,
  userUpdateRequestSchema,
  verifyPaymentRequestSchema,
  type FastApiValidationError,
} from '../src/schemas/index.js';

function parseOk<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  assert.equal(
    result.success,
    true,
    JSON.stringify(result.success ? {} : formatZodIssues(result.error.issues, input)),
  );
  return result.data as z.output<T>;
}

function parseErrors<T extends z.ZodType>(
  schema: T,
  input: unknown,
  prefix: readonly (string | number)[] = ['body'],
): FastApiValidationError[] {
  const result = schema.safeParse(input);
  assert.equal(result.success, false);
  if (result.success) {
    throw new Error('expected validation to fail');
  }
  return formatZodIssues(result.error.issues, input, prefix);
}

describe('email schema', () => {
  it('trims a valid recipient and keeps optional fields null', () => {
    assert.deepEqual(parseOk(emailRequestSchema, { recipient_email: '  a@b.co ' }), {
      recipient_email: 'a@b.co',
      email_draft: null,
      subject: null,
      body: null,
      candidate_id: null,
      template_id: null,
    });
  });

  it('renders the exact Pydantic value_error for a bad address', () => {
    assert.deepEqual(parseErrors(emailRequestSchema, { recipient_email: ' nope ' }), [
      {
        type: 'value_error',
        loc: ['body', 'recipient_email'],
        msg: "Value error, Invalid recipient email format: 'nope'",
        input: ' nope ',
        ctx: { error: "Invalid recipient email format: 'nope'" },
      },
    ]);
  });

  it('rejects a missing or non-string recipient exactly like Pydantic', () => {
    assert.deepEqual(parseErrors(emailRequestSchema, {}), [
      {
        type: 'missing',
        loc: ['body', 'recipient_email'],
        msg: 'Field required',
        input: {},
      },
    ]);
    assert.deepEqual(parseErrors(emailRequestSchema, { recipient_email: 5 }), [
      {
        type: 'string_type',
        loc: ['body', 'recipient_email'],
        msg: 'Input should be a valid string',
        input: 5,
      },
    ]);
  });

  it('defaults the email history query (limit 1..100, default 50)', () => {
    assert.deepEqual(parseOk(emailHistoryQuerySchema, {}), { candidate_id: null, limit: 50 });
    assert.equal(parseOk(emailHistoryQuerySchema, { limit: '100' }).limit, 100);
    assert.deepEqual(parseErrors(emailHistoryQuerySchema, { limit: '0' }, ['query']), [
      {
        type: 'greater_than_equal',
        loc: ['query', 'limit'],
        msg: 'Input should be greater than or equal to 1',
        input: '0',
        ctx: { ge: 1 },
      },
    ]);
  });
});

describe('payment schemas', () => {
  it('applies the credit amount default and Pydantic lax coercion', () => {
    assert.deepEqual(parseOk(consumeCreditRequestSchema, {}), {
      amount: 1,
      reason: 'candidate_analysis',
    });
    assert.equal(parseOk(consumeCreditRequestSchema, { amount: '2' }).amount, 2);
    assert.equal(parseOk(consumeCreditRequestSchema, { amount: 2.0 }).amount, 2);
    assert.equal(parseOk(consumeCreditRequestSchema, { amount: true }).amount, 1);
  });

  it('rejects amount < 1 and fractional numbers with Pydantic error types', () => {
    assert.deepEqual(parseErrors(consumeCreditRequestSchema, { amount: 0 }), [
      {
        type: 'greater_than_equal',
        loc: ['body', 'amount'],
        msg: 'Input should be greater than or equal to 1',
        input: 0,
        ctx: { ge: 1 },
      },
    ]);
    assert.deepEqual(parseErrors(consumeCreditRequestSchema, { amount: 1.5 }), [
      {
        type: 'int_from_float',
        loc: ['body', 'amount'],
        msg: 'Input should be a valid integer, got a number with a fractional part',
        input: 1.5,
      },
    ]);
    assert.equal(parseErrors(consumeCreditRequestSchema, { amount: null })[0]?.type, 'int_type');
  });

  it('requires plan_id and the three Razorpay verification fields', () => {
    assert.equal(parseErrors(createOrderRequestSchema, {})[0]?.type, 'missing');
    assert.deepEqual(
      parseErrors(verifyPaymentRequestSchema, { razorpay_order_id: 'a' }).map((error) => error.loc),
      [
        ['body', 'razorpay_payment_id'],
        ['body', 'razorpay_signature'],
      ],
    );
  });

  it('keeps plan defaults and required quota/features', () => {
    assert.deepEqual(
      parseOk(pricingPlanSchema, {
        id: 'pro',
        name: 'Pro',
        amount: 149900,
        candidate_quota: 100,
        features: ['a'],
      }),
      {
        id: 'pro',
        name: 'Pro',
        amount: 149900,
        currency: 'INR',
        interval: 'monthly',
        candidate_quota: 100,
        features: ['a'],
      },
    );
  });
});

describe('candidate evaluation schemas', () => {
  it('reports both required scores with input set to the parent object', () => {
    assert.deepEqual(parseErrors(candidateEvaluationRequestSchema, { candidate_id: 'x' }), [
      {
        type: 'missing',
        loc: ['body', 'tech_score'],
        msg: 'Field required',
        input: { candidate_id: 'x' },
      },
      {
        type: 'missing',
        loc: ['body', 'comm_score'],
        msg: 'Field required',
        input: { candidate_id: 'x' },
      },
    ]);
  });

  it('enforces 1..5 and coerces numeric strings', () => {
    assert.deepEqual(
      parseErrors(candidateEvaluationRequestSchema, {
        candidate_id: 'x',
        tech_score: 0,
        comm_score: 6,
      }),
      [
        {
          type: 'greater_than_equal',
          loc: ['body', 'tech_score'],
          msg: 'Input should be greater than or equal to 1',
          input: 0,
          ctx: { ge: 1 },
        },
        {
          type: 'less_than_equal',
          loc: ['body', 'comm_score'],
          msg: 'Input should be less than or equal to 5',
          input: 6,
          ctx: { le: 5 },
        },
      ],
    );

    const coerced = parseOk(candidateEvaluationRequestSchema, {
      candidate_id: 'x',
      tech_score: '3',
      comm_score: 4.0,
    });
    assert.equal(coerced.tech_score, 3);
    assert.equal(coerced.comm_score, 4);
    assert.equal(coerced.notes, '');
    assert.equal(coerced.job_id, null);
  });

  it('rejects fractional scores and accepts explicit null notes', () => {
    assert.equal(
      parseErrors(candidateEvaluationRequestSchema, {
        candidate_id: 'x',
        tech_score: 3.5,
        comm_score: 4,
      })[0]?.type,
      'int_from_float',
    );
    assert.equal(
      parseOk(candidateEvaluationRequestSchema, {
        candidate_id: 'x',
        tech_score: 1,
        comm_score: 1,
        notes: null,
      }).notes,
      null,
    );
  });

  it('keeps ATS/status defaults', () => {
    assert.deepEqual(parseOk(atsExportRequestSchema, {}), { format: 'json', session_id: null });
    assert.deepEqual(parseOk(candidateStatusRequestSchema, { status: 'new' }), {
      status: 'new',
      session_id: null,
      actor: 'human_recruiter',
    });
  });
});

describe('Pydantic numeric coercion', () => {
  it('matches Python numeric-literal parsing (underscores, .0, exponents)', () => {
    assert.equal(parseOk(consumeCreditRequestSchema, { amount: '1_0' }).amount, 10);
    assert.equal(parseOk(consumeCreditRequestSchema, { amount: '2.0' }).amount, 2);
    assert.equal(parseOk(consumeCreditRequestSchema, { amount: '10' }).amount, 10);
    assert.equal(
      parseErrors(consumeCreditRequestSchema, { amount: '2.5' })[0]?.type,
      'int_parsing',
    );
    assert.equal(
      parseErrors(consumeCreditRequestSchema, { amount: '1__0' })[0]?.type,
      'int_parsing',
    );

    assert.equal(parseOk(candidateSchema, { match_score: '1_0' }).match_score, 10);
    assert.equal(parseOk(candidateSchema, { match_score: '1e2' }).match_score, 100);
    assert.equal(parseOk(candidateSchema, { match_score: true }).match_score, 1);
    assert.equal(parseErrors(candidateSchema, { match_score: 'abc' })[0]?.type, 'float_parsing');
    assert.equal(
      parseErrors(pipelineStageSchema, { stage: 'x', count: 1, percentage: null })[0]?.type,
      'float_type',
    );
  });
});

describe('chat schemas', () => {
  it('applies list/object/async defaults', () => {
    assert.deepEqual(parseOk(chatRequestSchema, { message: 'hi' }), {
      message: 'hi',
      conversation_history: [],
      jd_structured: null,
      resumes: [],
      last_shortlist: null,
      pending_confirmation: null,
      last_intent: null,
      scheduled_interviews: null,
      session_id: null,
      async_mode: false,
      focused_candidate_id: null,
    });
  });

  it('requires message and preserves nested ChatMessage errors', () => {
    assert.deepEqual(parseErrors(chatRequestSchema, {}), [
      { type: 'missing', loc: ['body', 'message'], msg: 'Field required', input: {} },
    ]);
    assert.deepEqual(
      parseErrors(chatRequestSchema, {
        message: 'hi',
        conversation_history: [{ role: 'user' }],
      }),
      [
        {
          type: 'missing',
          loc: ['body', 'conversation_history', 0, 'content'],
          msg: 'Field required',
          input: { role: 'user' },
        },
      ],
    );
  });

  it('rejects null for non-optional lists but accepts null async_mode', () => {
    assert.equal(
      parseErrors(chatRequestSchema, { message: 'hi', conversation_history: null })[0]?.type,
      'list_type',
    );
    assert.equal(
      parseErrors(chatRequestSchema, { message: 'hi', resumes: null })[0]?.type,
      'list_type',
    );
    assert.equal(parseOk(chatRequestSchema, { message: 'hi', async_mode: null }).async_mode, null);
  });

  it('coerces bool query values and strips unknown keys', () => {
    assert.equal(parseOk(chatRequestSchema, { message: 'hi', async_mode: 'yes' }).async_mode, true);
    assert.deepEqual(parseOk(chatQuerySchema, { async_mode: 'on' }), { async_mode: true });
    assert.deepEqual(parseOk(chatQuerySchema, {}), { async_mode: false });
    assert.equal(
      parseErrors(chatRequestSchema, { message: 'hi', async_mode: 'abc' })[0]?.type,
      'bool_parsing',
    );
    assert.ok(!('unknown' in parseOk(chatRequestSchema, { message: 'hi', unknown: 1 })));
  });
});

describe('privacy / sessions / reports schemas', () => {
  it('keeps retention defaults and allows null/negative values', () => {
    assert.deepEqual(parseOk(retentionRunRequestSchema, {}), {
      raw_resume_ttl_days: 90,
      chat_ttl_days: 365,
    });
    assert.deepEqual(parseOk(retentionRunRequestSchema, { raw_resume_ttl_days: null }), {
      raw_resume_ttl_days: null,
      chat_ttl_days: 365,
    });
    assert.equal(
      parseOk(retentionRunRequestSchema, { raw_resume_ttl_days: -5 }).raw_resume_ttl_days,
      -5,
    );
  });

  it('accepts the unused title model and arbitrary session patch payload', () => {
    assert.deepEqual(parseOk(patchSessionRequestSchema, {}), { title: null });
  });

  it('applies report defaults', () => {
    assert.deepEqual(parseOk(reportRequestSchema, {}), {
      jd: null,
      shortlist: [],
      interview_questions: '',
      salary_data: '',
      candidates: [],
      evaluations: null,
      scheduled_interviews: [],
      is_blind_mode: false,
      session_title: null,
      recruiter_name: null,
    });
  });
});

describe('user schemas', () => {
  it('accepts all-null profile updates and defaults preferences to null', () => {
    assert.deepEqual(parseOk(userUpdateRequestSchema, {}), {
      full_name: null,
      avatar_url: null,
      phone: null,
      company_name: null,
      company_website: null,
      department: null,
      role: null,
      preferences: null,
    });
  });

  it('rejects non-object preferences with dict_type', () => {
    assert.deepEqual(parseErrors(userUpdateRequestSchema, { preferences: 'x' }), [
      {
        type: 'dict_type',
        loc: ['body', 'preferences'],
        msg: 'Input should be a valid dictionary',
        input: 'x',
      },
    ]);
  });

  it('applies profile defaults and serialises Date values to ISO strings', () => {
    const profile = parseOk(userProfileResponseSchema, {
      id: 'u1',
      email: 'u@example.com',
      created_at: new Date('2026-01-02T03:04:05.000Z'),
    });
    assert.equal(profile.role, 'recruiter');
    assert.deepEqual(profile.preferences, {});
    assert.equal(profile.created_at, '2026-01-02T03:04:05.000Z');
    assert.equal(profile.last_sign_in_at, null);
  });
});

describe('candidate / job description schemas', () => {
  it('keeps candidate defaults and the nullable-vs-list distinction', () => {
    const candidate = parseOk(candidateSchema, {});
    assert.equal(candidate.candidate_id, '');
    assert.equal(candidate.name, 'Candidate');
    assert.equal(candidate.raw_text, '');
    assert.equal(candidate.match_score, null);
    assert.deepEqual(candidate.skills, []);
    assert.equal(candidate.consent_version, '1.0');
    assert.equal(candidate.source, 'direct_upload');

    assert.equal(parseOk(candidateSchema, { raw_text: null }).raw_text, null);
    assert.equal(parseErrors(candidateSchema, { skills: null })[0]?.type, 'list_type');
  });

  it('keeps JobDescription defaults and int coercion', () => {
    const jd = parseOk(jobDescriptionSchema, { experience_years: '3' });
    assert.equal(jd.experience_years, 3);
    assert.deepEqual(jd.required_skills, []);
    assert.equal(jd.tone, 'professional');
    assert.equal(jd.company_name, null);
  });
});

describe('analytics schemas', () => {
  it('validates the days/top_n/limit query constraints', () => {
    assert.deepEqual(parseOk(analyticsDaysQuerySchema, {}), { days: 30 });
    assert.equal(parseOk(analyticsDaysQuerySchema, { days: '7' }).days, 7);
    assert.equal(parseOk(analyticsDaysQuerySchema, { days: '365' }).days, 365);
    assert.deepEqual(parseErrors(analyticsDaysQuerySchema, { days: '5' }, ['query']), [
      {
        type: 'greater_than_equal',
        loc: ['query', 'days'],
        msg: 'Input should be greater than or equal to 7',
        input: '5',
        ctx: { ge: 7 },
      },
    ]);
    assert.equal(parseOk(analyticsTopNQuerySchema, {}).top_n, 12);
    assert.equal(parseOk(analyticsLimitQuerySchema, {}).limit, 20);
    assert.equal(
      parseErrors(analyticsTopNQuerySchema, { top_n: '31' })[0]?.type,
      'less_than_equal',
    );
    assert.equal(
      parseErrors(analyticsLimitQuerySchema, { limit: '4' })[0]?.type,
      'greater_than_equal',
    );
  });

  it('applies analytics summary response defaults', () => {
    assert.deepEqual(parseOk(analyticsSummarySchema, {}), {
      total_candidates: 0,
      total_jobs: 0,
      active_jobs: 0,
      total_applications: 0,
      total_shortlisted: 0,
      total_interviews: 0,
      upcoming_interviews: 0,
      total_offered: 0,
      total_rejected: 0,
      avg_match_score: null,
      total_chat_sessions: 0,
      screening_rate: null,
      interview_rate: null,
      offer_rate: null,
    });
  });
});

describe('ingest and serialization helpers', () => {
  it('defaults the multipart session_id to null but keeps an empty string', () => {
    assert.deepEqual(parseOk(ingestFormSchema, {}), { session_id: null });
    assert.deepEqual(parseOk(ingestFormSchema, { session_id: '' }), { session_id: '' });
    assert.deepEqual(parseOk(ingestFormSchema, { session_id: 'sess-1' }), { session_id: 'sess-1' });
  });

  it('serializes response models by stripping unknown keys', () => {
    const stats = serializeResponse(outreachStatsResponseSchema, {
      total_sent: 3,
      smtp_count: 1,
      simulated_count: 2,
      failed_count: 0,
      ignored: true,
    });
    assert.deepEqual(stats, {
      total_sent: 3,
      smtp_count: 1,
      simulated_count: 2,
      failed_count: 0,
    });
  });
});
