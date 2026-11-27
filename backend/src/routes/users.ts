import { Router, type RequestHandler } from 'express';

import type { AppConfig } from '../config/index.js';
import { getCurrentUserId } from '../context/request-context.js';
import type { WorkspaceQueryStore } from '../db/workspace-query-store.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { userUpdateRequestSchema, type UserUpdateRequest } from '../schemas/user.js';
import { createUserService, type UserService } from '../services/user-service.js';

/** Port of `backend/app/api/routes_users.py` (`/api/users/me`). */

export interface UsersRouterOptions {
  readonly config?: AppConfig;
  readonly queryStore?: WorkspaceQueryStore;
  readonly userService?: UserService;
  readonly auth?: RequestHandler;
}

export function createUsersRouter(options: UsersRouterOptions = {}): Router {
  const router = Router();
  const service =
    options.userService ??
    createUserService({
      ...(options.config === undefined ? {} : { config: options.config }),
      ...(options.queryStore === undefined ? {} : { queryStore: options.queryStore }),
    });
  const auth =
    options.auth ?? (options.config ? requireAuth({ config: options.config }) : requireAuth());

  router.get('/me', auth, async (_req, res) => {
    res.json(await service.getProfile(getCurrentUserId()));
  });

  router.patch('/me', auth, validateBody(userUpdateRequestSchema), async (req, res) => {
    res.json(await service.updateProfile(req.body as UserUpdateRequest, getCurrentUserId()));
  });

  return router;
}
