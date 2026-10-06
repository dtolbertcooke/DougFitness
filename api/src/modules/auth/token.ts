// api/src/modules/auth/token.ts
// The one place tokens are signed, so signup and login always produce the same payload shape
// (v1 signed different payloads in each place, which broke the workouts route for new users).
import jwt from "jsonwebtoken";
import { env } from "../../config/env";

export const TOKEN_ISSUER = "dougfitness-api";
export const TOKEN_AUDIENCE = "dougfitness-app";

export const signToken = (userId: string) =>
  jwt.sign({}, env().JWT_SECRET, {
    subject: userId,
    // exactOptionalPropertyTypes rejects the `| undefined` in the library's own type; JWT_TTL
    // always has a value (env.ts defaults it), so the cast just narrows that back out.
    expiresIn: env().JWT_TTL as NonNullable<jwt.SignOptions["expiresIn"]>,
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
    algorithm: "HS256",
  });
