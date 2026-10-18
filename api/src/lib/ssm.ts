// api/src/lib/ssm.ts
// Loads every parameter under `prefix` from SSM Parameter Store into process.env, so env() sees them as if
// they had come from a .env file. server.ts calls this only when SSM_PREFIX is set (in AWS, not locally).
//   /dougfitness/prod/MONGODB_URI  ->  process.env.MONGODB_URI
// Parameters are SecureStrings, decrypted by SSM with the default aws/ssm key. Values are never logged.
import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';

export async function loadSsmParams(prefix: string): Promise<void> {
  const base = prefix.replace(/\/+$/, '');
  const client = new SSMClient({});
  let nextToken: string | undefined;
  do {
    const page = await client.send(
      new GetParametersByPathCommand({ Path: base, WithDecryption: true, NextToken: nextToken }),
    );
    for (const param of page.Parameters ?? []) {
      if (param.Name && param.Value !== undefined) process.env[param.Name.slice(base.length + 1)] = param.Value;
    }
    nextToken = page.NextToken;
  } while (nextToken);
}
