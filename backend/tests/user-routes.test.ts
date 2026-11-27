import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import request from 'supertest';

import { USER_ID, withPhase15 } from './phase15-helpers.js';

describe('user profile routes', () => {
  it('returns the profile with the eight preference defaults merged in', async () => {
    await withPhase15(async ({ app }) => {
      const response = await request(app).get('/api/users/me').expect(200);
      assert.equal(response.body.id, USER_ID);
      assert.equal(response.body.email, `${USER_ID}@recruitai.local`);
      assert.equal(response.body.full_name, 'Lead Recruiter');
      assert.equal(response.body.department, null);
      assert.equal(response.body.role, 'recruiter');
      assert.deepEqual(response.body.preferences, {
        email_alerts: true,
        theme: 'dark',
        blind_mode_default: false,
        auto_rubric: true,
        match_threshold: 75,
        default_export_format: 'pdf',
        digest_frequency: 'instant',
        sound_effects: true,
      });
    });
  });

  it('returns the documented development fallback when the row is missing', async () => {
    await withPhase15(async ({ app, db }) => {
      db.table('users').delete().eq('id', USER_ID).execute();

      const response = await request(app).get('/api/users/me').expect(200);
      assert.deepEqual(response.body, {
        id: USER_ID,
        email: `${USER_ID}@recruitai.local`,
        full_name: 'Lead Recruiter',
        avatar_url: null,
        phone: null,
        company_name: null,
        company_website: null,
        department: null,
        role: 'recruiter',
        preferences: {
          email_alerts: true,
          theme: 'system',
          blind_mode_default: false,
          auto_rubric: true,
        },
        last_sign_in_at: null,
        created_at: null,
        updated_at: null,
      });
    });
  });

  it('updates profile fields and merges preferences', async () => {
    await withPhase15(async ({ app, db }) => {
      const response = await request(app)
        .patch('/api/users/me')
        .send({
          full_name: '  Dana Scully  ',
          company_name: 'FBI',
          role: 'admin',
          department: 'X-Files',
          preferences: { theme: 'light', match_threshold: 80 },
        })
        .expect(200);

      assert.equal(response.body.full_name, 'Dana Scully');
      assert.equal(response.body.company_name, 'FBI');
      assert.equal(response.body.role, 'recruiter', 'invalid roles are ignored');
      assert.equal(response.body.department, null);
      assert.deepEqual(response.body.preferences, {
        email_alerts: true,
        theme: 'light',
        blind_mode_default: false,
        auto_rubric: true,
        match_threshold: 80,
        default_export_format: 'pdf',
        digest_frequency: 'instant',
        sound_effects: true,
      });

      const row = db.table('users').select().eq('id', USER_ID).execute().data[0];
      assert.equal(row?.full_name, 'Dana Scully');
      assert.deepEqual(row?.preferences, response.body.preferences);
    });
  });

  it('returns the current profile when the patch has no fields', async () => {
    await withPhase15(async ({ app }) => {
      const response = await request(app).patch('/api/users/me').send({}).expect(200);
      assert.equal(response.body.full_name, 'Lead Recruiter');
      assert.equal(response.body.theme, undefined);
    });
  });

  it('rejects a non-object preferences payload', async () => {
    await withPhase15(async ({ app }) => {
      const response = await request(app)
        .patch('/api/users/me')
        .send({ preferences: 'not-an-object' })
        .expect(422);
      assert.equal(response.body.detail[0].loc[0], 'body');
      assert.equal(response.body.detail[0].loc[1], 'preferences');
    });
  });
});
