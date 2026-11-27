import { z } from 'zod';

import { optionalString, pydanticBool, pydanticDict } from './common.js';

/**
 * Port of `routes_reports.py::ReportRequest`.
 *
 * The response is a streamed PDF (or CSV for ATS), not JSON, so only the
 * request model is declared here.
 */
export const reportRequestSchema = z.object({
  jd: pydanticDict().nullable().default(null),
  shortlist: z.array(pydanticDict()).default(() => []),
  interview_questions: z.string().default(''),
  salary_data: z.string().default(''),
  candidates: z.array(pydanticDict()).default(() => []),
  evaluations: pydanticDict().nullable().default(null),
  scheduled_interviews: z.array(pydanticDict()).default(() => []),
  is_blind_mode: pydanticBool().nullable().default(false),
  session_title: optionalString(),
  recruiter_name: optionalString(),
});

export type ReportRequest = z.infer<typeof reportRequestSchema>;
