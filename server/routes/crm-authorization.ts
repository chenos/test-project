import { ApiError } from '@nocobase/app-server/router';
import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import type { RepositoryPolicy } from '@nocobase/db';

/** Consume this action's complete decision; raw CRUD grants are never substituted. */
export async function crmPolicies(
  authz: AuthorizationContext,
  resource: string,
  action: string,
  collections: string[],
): Promise<Record<string, RepositoryPolicy>> {
  const decision = await authz.authorize({
    resource: { type: 'composite', id: resource },
    action,
  });
  const policies = decision.conditions?.database;
  if (
    decision.effect === 'deny' ||
    !policies ||
    collections.some((name) => !policies[name])
  )
    throw new ApiError({
      status: 'PERMISSION_DENIED',
      reason: 'AUTHORIZATION_DENIED',
      domain: 'authorization',
      message: 'This business operation is not allowed.',
    });
  return policies;
}
