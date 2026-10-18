// api/src/middleware/clientIp.ts
// Who is calling, for rate limiting. Behind Lambda Web Adapter neither obvious source works:
//  - req.ip is always the adapter's own 127.0.0.1, so every user would share one bucket.
//  - X-Forwarded-For is passed through from the client untouched by a Function URL, so trusting it would let
//    anyone pick a fresh identity per request.
// The adapter builds `x-amzn-request-context` from the real Lambda event and overwrites any client-supplied
// copy, so its http.sourceIp is the address AWS saw. That is only true behind the adapter: anywhere else a
// client could forge the header, so it is honoured only when `trustLambdaContext` is on (env
// TRUST_LAMBDA_CONTEXT, set in Terraform for the Lambda function and nowhere else).
import type { Request } from 'express';
import { z } from 'zod';

const LambdaRequestContext = z.object({ http: z.object({ sourceIp: z.string().min(1) }) });

export function clientIp(req: Request, trustLambdaContext: boolean): string {
  if (trustLambdaContext) {
    const raw = req.headers['x-amzn-request-context'];
    if (typeof raw === 'string') {
      try {
        const parsed = LambdaRequestContext.safeParse(JSON.parse(raw));
        if (parsed.success) return parsed.data.http.sourceIp;
      } catch {
        // not JSON: fall through to the socket address
      }
    }
  }
  // Fails safe: an unreadable header means a shared bucket, which throttles too much rather than too little.
  return req.ip ?? 'unknown';
}
