import { defineSeed, type QueryAdapter } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { crmPermissionSets } from '../../seed-data/crm-permission-sets.ts';

export async function initializeCrmPermissionSets(
  query: QueryAdapter,
): Promise<void> {
  for (const set of crmPermissionSets) {
    const existing = await query
      .selectFrom('authorizationPermissionSets')
      .select('id')
      .where('key', '=', set.key)
      .executeTakeFirst();
    if (existing) continue; // Never reset an administrator's grants or assignments.
    const now = new Date();
    await query
      .insertInto('authorizationPermissionSets')
      .values({
        id: set.key,
        key: set.key,
        title: encodeAuthorizationTitle(set.title),
        grants: JSON.stringify(set.grants),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }
}
export default defineSeed({
  name: '202610090001_crm_permission_sets',
  transaction: true,
  run: ({ query }) => initializeCrmPermissionSets(query),
});
