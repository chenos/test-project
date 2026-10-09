// @vitest-environment node
import path from 'node:path';
import { createRequire } from 'node:module';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';
const authRoot = path.dirname(
  createRequire(import.meta.url).resolve(
    '@nocobase/app-plugin-authentication/package.json',
  ),
);
describeMigration('202610090002_create_crm_teams', {
  sources: [
    {
      packageName: '@nocobase/app-plugin-authentication',
      directory: path.join(authRoot, 'dist/database/migrations'),
    },
    {
      packageName: 'test-project',
      directory: path.resolve(
        import.meta.dirname,
        '../../database/main/migrations',
      ),
    },
  ],
  up: async ({ expectCollection }) => {
    await expectCollection('crmTeams').toHaveField('active', {
      nullable: false,
    });
    await expectCollection('crmTeamMembers').toHaveField('userId', {
      nullable: false,
    });
    await expectCollection('crmTeamMembers').toHaveField('teamId', {
      nullable: false,
    });
    await expectCollection('crmTeamMembers').toHaveField('version', {
      nullable: false,
    });
    const changes = await expectCollection('crmTeamChanges').toExist();
    expect(changes.primaryKey).toEqual(['id']);
  },
  down: async ({ expectCollection }) => {
    await expectCollection('crmTeamChanges').not.toExist();
    await expectCollection('crmTeamMembers').not.toExist();
    await expectCollection('crmTeams').not.toExist();
    await expectCollection('customers').toExist();
  },
});
