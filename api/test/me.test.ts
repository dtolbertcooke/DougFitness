// api/test/me.test.ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { signUp } from './helpers';

const app = buildApp();

describe('GET /v1/me', () => {
  it('never returns passwordHash', async () => {
    const { token } = await signUp(app, 'getme@test.dev');
    const res = await request(app).get('/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.email).toBe('getme@test.dev');
  });
});

describe('PATCH /v1/me', () => {
  it('updates the display name', async () => {
    const { token } = await signUp(app, 'patchme@test.dev');
    const res = await request(app)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Updated Name' })
      .expect(200);
    expect(res.body.displayName).toBe('Updated Name');
  });

  it('rejects a password field with 400', async () => {
    const { token } = await signUp(app, 'nopassword@test.dev');
    await request(app)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'sneaky new password' })
      .expect(400);
  });
});

describe('POST /v1/me/password', () => {
  it('requires the current password to be correct', async () => {
    const { token } = await signUp(app, 'changepw@test.dev');
    await request(app)
      .post('/v1/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrong', newPassword: 'a whole new password' })
      .expect(401);
  });

  it('changes the password and signs in with the new one', async () => {
    const { token } = await signUp(app, 'changepw2@test.dev', 'original password value');
    await request(app)
      .post('/v1/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'original password value', newPassword: 'brand new password value' })
      .expect(204);

    await request(app)
      .post('/v1/auth/signin')
      .send({ email: 'changepw2@test.dev', password: 'brand new password value' })
      .expect(200);
  });
});

describe('DELETE /v1/me', () => {
  it('removes the account', async () => {
    const { token } = await signUp(app, 'deleteme@test.dev', 'delete me password');
    await request(app).delete('/v1/me').set('Authorization', `Bearer ${token}`).expect(204);

    await request(app)
      .post('/v1/auth/signin')
      .send({ email: 'deleteme@test.dev', password: 'delete me password' })
      .expect(401);
  });
});
