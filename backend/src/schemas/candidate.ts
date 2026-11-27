import { z } from 'zod';

import { optionalString, pydanticFloat, stringListDefault } from './common.js';

/**
 * Port of `app/schemas/candidate_schema.py::Candidate`.
 *
 * Note the deliberate mix of optional-null and non-optional list fields:
 * `matched_skills`/`gaps`/etc. accept `null`, while `skills`, `links`, etc.
 * default to `[]` and reject `null` (Pydantic's exact behaviour).
 */
export const candidateSchema = z.object({
  candidate_id: z.string().default(''),
  name: z.string().default('Candidate'),
  raw_text: optionalString(''),
  match_score: pydanticFloat().nullable().default(null),
  matched_skills: z.array(z.string()).nullable().default(null),
  gaps: z.array(z.string()).nullable().default(null),
  experience_years: pydanticFloat().nullable().default(null),
  red_flags: z.array(z.string()).nullable().default(null),
  email: optionalString(),
  phone: optionalString(),
  location: optionalString(),
  headline: optionalString(),
  summary: optionalString(),
  skills: stringListDefault(),
  work_experience: stringListDefault(),
  education: stringListDefault(),
  certifications: stringListDefault(),
  links: stringListDefault(),
  languages: stringListDefault(),
  // AI-SEC-6: Candidate Consent & GDPR Art. 22 compliance
  consent_at: optionalString(),
  consent_version: optionalString('1.0'),
  source: optionalString('direct_upload'),
});

export type Candidate = z.infer<typeof candidateSchema>;
