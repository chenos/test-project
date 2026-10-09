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
describeMigration('202610090001_create_customers_contacts', {
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
    const customers = await expectCollection('customers').toExist();
    const contacts = await expectCollection('contacts').toExist();
    expect(customers.primaryKey).toEqual(['id']);
    expect(contacts.primaryKey).toEqual(['id']);
    await expectCollection('customers').toHaveField('companyName', {
      nullable: false,
    });
    await expectCollection('customers').toHaveField('ownerId', {
      nullable: false,
    });
    await expectCollection('customers').toHaveField('grade', {
      nullable: true,
    });
    await expectCollection('contacts').toHaveField('customerId', {
      nullable: false,
    });
    await expectCollection('contacts').toHaveField('phone', {
      type: 'string',
      nullable: true,
    });
    await expectCollection('customers').toHaveField('version', {
      nullable: false,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('contacts').not.toExist();
    await expectCollection('customers').not.toExist();
  },
});
