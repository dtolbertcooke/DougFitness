// api/test/ratelimit.test.ts
// Behind Lambda Web Adapter every request reaches Express from 127.0.0.1, and a Function URL passes a client's own
// X-Forwarded-For through unchanged, so neither can identify a caller. The adapter's x-amzn-request-context header
// is built from the real Lambda event (it overwrites a client-supplied copy), and carries the true source IP.
import type { Request } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { clientIp } from '../src/middleware/clientIp';

const context = (sourceIp: string) => JSON.stringify({ http: { sourceIp } });
const fakeReq = (headers: Record<string, string>, ip = '::ffff:127.0.0.1') => ({ headers, ip }) as unknown as Request;

describe('clientIp', () => {
  it('uses the Lambda request context source IP when that header is trusted', () => {
    expect(clientIp(fakeReq({ 'x-amzn-request-context': context('203.0.113.7') }), true)).toBe('203.0.113.7');
  });

  it('ignores the header when it is not trusted', () => {
    expect(clientIp(fakeReq({ 'x-amzn-request-context': context('203.0.113.7') }), false)).toBe('::ffff:127.0.0.1');
  });

  it('ignores X-Forwarded-For either way: a client can set it to anything', () => {
    const headers = { 'x-forwarded-for': '9.9.9.9' };
    expect(clientIp(fakeReq(headers), true)).toBe('::ffff:127.0.0.1');
    expect(clientIp(fakeReq(headers), false)).toBe('::ffff:127.0.0.1');
  });

  it.each([
    ['missing', undefined],
    ['not JSON', 'nope'],
    ['no http block', '{"requestId":"x"}'],
    ['empty source IP', context('')],
  ])('falls back to the socket address when the header is %s', (_name, value) => {
    const headers: Record<string, string> = value === undefined ? {} : { 'x-amzn-request-context': value };
    expect(clientIp(fakeReq(headers), true)).toBe('::ffff:127.0.0.1');
  });
});

// 20 requests per 15 minutes per client on /v1/auth/*. An empty body fails validation with a 400 (cheap, no
// password hashing) but still counts against the limit.
const hit = (app: ReturnType<typeof buildApp>, sourceIp: string, forwardedFor = sourceIp) =>
  request(app)
    .post('/v1/auth/signin')
    .set('x-amzn-request-context', context(sourceIp))
    .set('x-forwarded-for', forwardedFor)
    .send({});

async function exhaust(app: ReturnType<typeof buildApp>, sourceIp: string) {
  for (let i = 0; i < 20; i++) await hit(app, sourceIp).expect(400);
}

describe('auth rate limit, running behind Lambda (context header trusted)', () => {
  it('limits each client separately', async () => {
    const app = buildApp({ trustLambdaContext: true });
    await exhaust(app, '198.51.100.1');
    await hit(app, '198.51.100.1').expect(429);
    await hit(app, '198.51.100.2').expect(400); // a different client is unaffected
  });

  it('cannot be dodged by changing X-Forwarded-For', async () => {
    const app = buildApp({ trustLambdaContext: true });
    await exhaust(app, '198.51.100.3');
    await hit(app, '198.51.100.3', '1.2.3.4').expect(429);
    await hit(app, '198.51.100.3', '5.6.7.8, 9.9.9.9').expect(429);
  });

  it('tells IPv6 clients apart', async () => {
    const app = buildApp({ trustLambdaContext: true });
    await exhaust(app, '2001:db8:1::1');
    await hit(app, '2001:db8:1::1').expect(429);
    await hit(app, '2001:db8:2::1').expect(400);
  });
});

describe('auth rate limit, header not trusted (local dev, or anything that is not Lambda)', () => {
  it('ignores the context header, so a client cannot mint itself fresh buckets by forging it', async () => {
    const app = buildApp({ trustLambdaContext: false });
    await exhaust(app, '198.51.100.10');
    await hit(app, '198.51.100.11').expect(429); // same socket, same bucket, whatever the header says
  });
});
