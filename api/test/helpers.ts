// api/test/helpers.ts
import request from 'supertest';
import type { Express } from 'express';

export async function signUp(app: Express, email: string, password = 'correct horse battery staple') {
  const res = await request(app)
    .post('/v1/auth/signup')
    .send({ email, password, displayName: 'Test User' })
    .expect(201);
  return { token: res.body.token as string, userId: res.body.user.id as string };
}
