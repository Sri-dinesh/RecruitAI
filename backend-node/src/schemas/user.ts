import { z } from 'zod';

import { isoDateTime, optionalString, pydanticBool, pydanticDict, pydanticInt } from './common.js';

/** Port of `app/schemas/user_schema.py::UserPreferences`. */
export const userPreferencesSchema = z.object({
  email_alerts: pydanticBool().default(true),
  theme: z.string().default('system'),
  blind_mode_default: pydanticBool().default(false),
  auto_rubric: pydanticBool().default(true),
  match_threshold: pydanticInt().default(75),
  default_export_format: z.string().default('pdf'),
  digest_frequency: z.string().default('instant'),
  sound_effects: pydanticBool().default(true),
});

/**
 * Port of `UserProfileResponse`.
 *
 * `preferences` is `Dict[str, Any] = Field(default_factory=dict)` — a
 * non-optional object, so an explicit `null` is rejected.
 */
export const userProfileResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  full_name: optionalString(),
  avatar_url: optionalString(),
  phone: optionalString(),
  company_name: optionalString(),
  company_website: optionalString(),
  department: optionalString(),
  role: z.string().default('recruiter'),
  preferences: pydanticDict().default(() => ({})),
  last_sign_in_at: isoDateTime().nullable().default(null),
  created_at: isoDateTime().nullable().default(null),
  updated_at: isoDateTime().nullable().default(null),
});

/** Port of `UserUpdateRequest` — every field is `Optional[T] = None`. */
export const userUpdateRequestSchema = z.object({
  full_name: optionalString(),
  avatar_url: optionalString(),
  phone: optionalString(),
  company_name: optionalString(),
  company_website: optionalString(),
  department: optionalString(),
  role: optionalString(),
  preferences: pydanticDict().nullable().default(null),
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;
export type UserProfileResponse = z.infer<typeof userProfileResponseSchema>;
export type UserUpdateRequest = z.infer<typeof userUpdateRequestSchema>;
