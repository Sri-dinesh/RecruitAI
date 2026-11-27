import { z } from 'zod';

import { optionalString, pydanticInt, stringListDefault } from './common.js';

/** Port of `app/schemas/jd_schema.py::JobDescription`. */
export const jobDescriptionSchema = z.object({
  role: z.string().default(''),
  required_skills: stringListDefault(),
  experience_years: pydanticInt().default(0),
  raw_text: optionalString(''),
  tone: optionalString('professional'),
  company_name: optionalString(),
  department: optionalString(),
  location: optionalString(),
  employment_type: optionalString(),
  salary_range: optionalString(),
  education_requirements: optionalString(),
  preferred_skills: stringListDefault(),
  responsibilities: stringListDefault(),
  qualifications: stringListDefault(),
  benefits: stringListDefault(),
  industry: optionalString(),
  summary: optionalString(),
});

export type JobDescription = z.infer<typeof jobDescriptionSchema>;
