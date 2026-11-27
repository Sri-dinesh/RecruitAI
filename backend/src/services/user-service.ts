import type { AppConfig } from '../config/index.js';
import {
  createWorkspaceQueryStore,
  type DbRow,
  type WorkspaceQueryStore,
} from '../db/workspace-query-store.js';
import type { UserUpdateRequest } from '../schemas/user.js';
import { HttpError } from '../types/errors.js';

/** Port of `backend/app/api/routes_users.py`. */

const DEFAULT_PREFERENCES = {
  email_alerts: true,
  theme: 'system',
  blind_mode_default: false,
  auto_rubric: true,
  match_threshold: 75,
  default_export_format: 'pdf',
  digest_frequency: 'instant',
  sound_effects: true,
} as const;

export interface UserServiceOptions {
  readonly config?: AppConfig;
  readonly queryStore?: WorkspaceQueryStore;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Python `_parse_preferences`: merge the eight documented defaults. */
export function parsePreferences(preferences: unknown): Record<string, unknown> {
  if (typeof preferences === 'string') {
    try {
      const parsed = JSON.parse(preferences) as unknown;
      return isRecord(parsed) ? { ...DEFAULT_PREFERENCES, ...parsed } : { ...DEFAULT_PREFERENCES };
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }
  if (isRecord(preferences)) {
    return { ...DEFAULT_PREFERENCES, ...preferences };
  }
  return { ...DEFAULT_PREFERENCES };
}

/**
 * FastAPI `response_model=UserProfileResponse` serialises every declared field,
 * filling the optional ones with `null`. `department` is not a column in the
 * Node schema (`users` has no department), so it stays `null` — the field is
 * kept for contract compatibility.
 */
function formatProfile(row: DbRow, preferences: Record<string, unknown>): DbRow {
  return {
    id: row['id'],
    email: row['email'],
    full_name: row['full_name'] ?? null,
    avatar_url: row['avatar_url'] ?? null,
    phone: row['phone'] ?? null,
    company_name: row['company_name'] ?? null,
    company_website: row['company_website'] ?? null,
    department: null,
    role: row['role'] ?? 'recruiter',
    preferences,
    last_sign_in_at: row['last_sign_in_at'] ?? null,
    created_at: row['created_at'] ?? null,
    updated_at: row['updated_at'] ?? null,
  };
}

export class UserService {
  private readonly config: AppConfig | undefined;
  private store: WorkspaceQueryStore | undefined;

  constructor(options: UserServiceOptions = {}) {
    this.config = options.config;
    this.store = options.queryStore;
  }

  private getStore(): WorkspaceQueryStore {
    this.store ??= createWorkspaceQueryStore(
      this.config === undefined ? {} : { config: this.config },
    );
    return this.store;
  }

  async getProfile(userId: string): Promise<DbRow> {
    try {
      const row = await this.getStore().getUser(userId);
      if (row) {
        return formatProfile(row, parsePreferences(row['preferences']));
      }
    } catch (error) {
      if (this.config?.isProduction === true) {
        throw new HttpError(500, `Database error fetching user profile: ${errorMessage(error)}`);
      }
    }

    // Default profile for first-run development, with Python's four-key set.
    return formatProfile(
      {
        id: userId,
        email: `${userId}@recruitai.local`,
        full_name: 'Lead Recruiter',
        role: 'recruiter',
      },
      {
        email_alerts: true,
        theme: 'system',
        blind_mode_default: false,
        auto_rubric: true,
      },
    );
  }

  async updateProfile(payload: UserUpdateRequest, userId: string): Promise<DbRow> {
    const updateData: DbRow = {};
    const textFields = [
      'full_name',
      'avatar_url',
      'phone',
      'company_name',
      'company_website',
    ] as const;
    for (const field of textFields) {
      const value = payload[field];
      if (value !== null && value !== undefined) {
        updateData[field] = value.trim();
      }
    }
    if (payload.role !== null && payload.role !== undefined) {
      if (['recruiter', 'employer'].includes(payload.role)) {
        updateData['role'] = payload.role;
      }
    }
    if (payload.preferences !== null && payload.preferences !== undefined) {
      const current = await this.getProfile(userId);
      const existing = current['preferences'];
      const existingPreferences = isRecord(existing) ? existing : parsePreferences(existing);
      updateData['preferences'] = { ...existingPreferences, ...payload.preferences };
    }

    if (Object.keys(updateData).length === 0) {
      return this.getProfile(userId);
    }

    try {
      const row = await this.getStore().updateUser(userId, updateData);
      if (row) {
        return formatProfile(row, parsePreferences(row['preferences']));
      }
    } catch (error) {
      if (this.config?.isProduction === true) {
        throw new HttpError(500, `Database error updating user profile: ${errorMessage(error)}`);
      }
    }

    const current = await this.getProfile(userId);
    Object.assign(current, updateData);
    current['preferences'] = parsePreferences(current['preferences']);
    return current;
  }
}

/** Factory used by the API router and tests. */
export function createUserService(options: UserServiceOptions = {}): UserService {
  return new UserService(options);
}
