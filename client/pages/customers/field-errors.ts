import { ApiClientError } from '@nocobase/app-client';
import { z } from 'zod';

export function invalidFields(error: unknown): string[] {
  if (!(error instanceof ApiClientError) || error.status !== 400) return [];
  const parsed = z
    .object({
      error: z.object({
        fieldViolations: z.array(z.object({ field: z.string() })).optional(),
      }),
    })
    .safeParse(error.payload);
  return parsed.success
    ? (parsed.data.error.fieldViolations ?? []).map((issue) =>
        issue.field.replace(/^body\./, ''),
      )
    : [];
}
