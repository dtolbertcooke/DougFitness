// api/test/auth.test.ts
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { env } from '../src/config/env';
import { signUp } from './helpers';

const app = buildApp();

describe('POST /v1/auth/signup', () => {
  it('creates a user and returns a token', async () => {
    const res = await request(app)
      .post('/v1/auth/signup')
      .send({ email: 'new@test.dev', password: 'correct horse battery staple', displayName: 'New User' })
      .expect(201);

    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'new@test.dev', displayName: 'New User' });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects a duplicate email', async () => {
    await request(app)
      .post('/v1/auth/signup')
      .send({ email: 'dup@test.dev', password: 'correct horse battery staple', displayName: 'First' })
      .expect(201);

    await request(app)
      .post('/v1/auth/signup')
      .send({ email: 'dup@test.dev', password: 'another password', displayName: 'Second' })
      .expect(409);
  });
});

describe('POST /v1/auth/signin', () => {
  it('signs in with the same token shape signup produced', async () => {
    await request(app)
      .post('/v1/auth/signup')
      .send({ email: 'signin@test.dev', password: 'correct horse battery staple', displayName: 'Signin User' })
      .expect(201);

    const res = await request(app)
      .post('/v1/auth/signin')
      .send({ email: 'signin@test.dev', password: 'correct horse battery staple' })
      .expect(200);

    const claims = jwt.decode(res.body.token) as jwt.JwtPayload;
    expect(claims.sub).toEqual(res.body.user.id);
  });

  it('returns the identical response for a wrong password and an unknown email', async () => {
    await request(app)
      .post('/v1/auth/signup')
      .send({ email: 'known@test.dev', password: 'correct horse battery staple', displayName: 'Known User' })
      .expect(201);

    const wrongPassword = await request(app)
      .post('/v1/auth/signin')
      .send({ email: 'known@test.dev', password: 'wrong password entirely' })
      .expect(401);

    const unknownEmail = await request(app)
      .post('/v1/auth/signin')
      .send({ email: 'nobody@test.dev', password: 'wrong password entirely' })
      .expect(401);

    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });
});

describe('requireAuth', () => {
  it('rejects a request with no token', async () => {
    await request(app).get('/v1/me').expect(401);
  });

  it('rejects a tampered token', async () => {
    const { token } = await signUp(app, 'tampered@test.dev');
    await request(app)
      .get('/v1/me')
      .set('Authorization', `Bearer ${token}x`)
      .expect(401);
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign({}, env().JWT_SECRET, {
      subject: 'irrelevant-user-id',
      expiresIn: -1,
      issuer: 'liftlog-api',
      audience: 'liftlog-app',
      algorithm: 'HS256',
    });
    await request(app).get('/v1/me').set('Authorization', `Bearer ${expired}`).expect(401);
  });
});
