// api/src/lib/ssm.ts
// Real implementation arrives in Phase 3 (loads secrets from SSM Parameter Store).
// Until then, server.ts only calls this when SSM_PREFIX is set, which it isn't locally.
export async function loadSsmParams(_prefix: string): Promise<void> {}
