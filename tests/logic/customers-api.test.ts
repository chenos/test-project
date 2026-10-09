// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import { CustomerSchema, ContactSchema } from '../../server/routes/schemas.js';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    auth: { baseURL: 'http://localhost', trustedOrigins: ['http://localhost'] },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});
const json = (method: string, body: object): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json', origin: 'http://localhost' },
  body: JSON.stringify(body),
});

test('protects customers, contacts and owner identities from anonymous and ordinary users', async ({
  request,
  testApp,
}) => {
  for (const path of [
    '/customers',
    '/customerOwners',
    '/customers/missing/contacts',
  ])
    expect((await request(path)).status).toBe(401);
  const signup = await request(
    '/auth/sign-up/email',
    json('POST', {
      email: 'operator@example.test',
      password: 'Test-only-passphrase-123',
      name: 'Operator',
    }),
  );
  expect(signup.status).toBe(200);
  const operator = await signIn(testApp, {
    email: 'operator@example.test',
    password: 'Test-only-passphrase-123',
  });
  for (const path of [
    '/customers',
    '/customerOwners',
    '/customers/missing/contacts',
  ])
    expect((await operator.fetch(path)).status).toBe(403);
  expect(
    (
      await operator.fetch(
        '/customers',
        json('POST', { companyName: 'Forbidden' }),
      )
    ).status,
  ).toBe(403);
});

test('creates, filters, paginates and edits customers; accepts duplicate names and detects stale writes', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const response = await admin.fetch(
    '/customers',
    json('POST', {
      companyName: '  星河制造  ',
      status: 'active',
      grade: 'A',
      industry: '制造',
      notes: '第一行\n第二行',
    }),
  );
  expect(await response.clone().text(), 'create payload').not.toContain(
    'error',
  );
  expect(response.status).toBe(201);
  const { data: customer } = await response.json();
  expect(() => CustomerSchema.parse(customer)).not.toThrow();
  expect(customer).toMatchObject({
    companyName: '星河制造',
    ownerId: admin.user.id,
    owner: { id: admin.user.id },
    createdById: admin.user.id,
    version: 1,
    grade: 'A',
  });
  expect(
    (
      await admin.fetch(
        '/customers',
        json('POST', {
          companyName: '星河制造',
          status: 'potential',
          grade: 'B',
        }),
      )
    ).status,
  ).toBe(201);
  const list = await (
    await admin.fetch(
      `/customers?search=${encodeURIComponent('星河')}&ownerId=${admin.user.id}&status=active&grade=A&pageSize=1`,
    )
  ).json();
  expect(list.meta).toMatchObject({ total: 1, pageSize: 1, page: 1 });
  expect(list.data.map((row: { id: string }) => row.id)).toEqual([customer.id]);
  const duplicate = await (
    await admin.fetch(
      `/customers?exactName=${encodeURIComponent('星河制造')}&pageSize=1&page=2`,
    )
  ).json();
  expect(duplicate.meta.total).toBe(2);
  expect(duplicate.data).toHaveLength(1);
  const updated = await admin.fetch(
    `/customers/${customer.id}`,
    json('PATCH', { version: 1, status: 'lost', notes: null }),
  );
  expect(updated.status).toBe(200);
  expect((await updated.json()).data).toMatchObject({
    status: 'lost',
    notes: null,
    version: 2,
  });
  expect(
    (
      await admin.fetch(
        `/customers/${customer.id}`,
        json('PATCH', { version: 1, companyName: 'Stale' }),
      )
    ).status,
  ).toBe(409);
  expect((await admin.fetch('/customers/missing')).status).toBe(404);
  expect(
    (await admin.fetch('/customers', json('POST', { companyName: ' ' })))
      .status,
  ).toBe(400);
  expect(
    (
      await admin.fetch(
        '/customers',
        json('POST', { companyName: 'Bad owner', ownerId: 'missing' }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await admin.fetch(
        '/customers',
        json('POST', { companyName: 'Bad enum', grade: 'D' }),
      )
    ).status,
  ).toBe(400);
  const owners = await (await admin.fetch('/customerOwners')).json();
  expect(
    owners.data.every(
      (row: object) => Object.keys(row).sort().join(',') === 'id,name',
    ),
  ).toBe(true);
});

test('keeps multiple contacts under their parent and refuses reparenting, invalid email and stale updates', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const makeCustomer = async (companyName: string) =>
    (
      await (
        await admin.fetch('/customers', json('POST', { companyName }))
      ).json()
    ).data;
  const customer = await makeCustomer('联系人客户');
  const other = await makeCustomer('另一个客户');
  const created = await admin.fetch(
    `/customers/${customer.id}/contacts`,
    json('POST', {
      name: ' 王女士 ',
      phone: '+86 021 1234 转 8',
      email: 'wang@example.test',
    }),
  );
  expect(created.status).toBe(201);
  const { data: contact } = await created.json();
  expect(() => ContactSchema.parse(contact)).not.toThrow();
  expect(contact).toMatchObject({
    customerId: customer.id,
    name: '王女士',
    version: 1,
    phone: '+86 021 1234 转 8',
  });
  expect(
    (
      await admin.fetch(
        `/customers/${customer.id}/contacts`,
        json('POST', { name: '李先生' }),
      )
    ).status,
  ).toBe(201);
  const list = await (
    await admin.fetch(`/customers/${customer.id}/contacts`)
  ).json();
  expect(list.meta.total).toBe(2);
  expect(
    (await admin.fetch(`/customers/${other.id}/contacts/${contact.id}`)).status,
  ).toBe(404);
  expect(
    (
      await admin.fetch(
        `/customers/${other.id}/contacts/${contact.id}`,
        json('PATCH', { version: 1, name: 'Cross-parent' }),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await admin.fetch(
        `/customers/${customer.id}/contacts`,
        json('POST', { name: 'Email', email: 'invalid' }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await admin.fetch(
        `/customers/${customer.id}/contacts`,
        json('POST', { name: 'Reparent', customerId: other.id }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await admin.fetch(
        '/customers/missing/contacts',
        json('POST', { name: 'Missing' }),
      )
    ).status,
  ).toBe(404);
  const changed = await admin.fetch(
    `/customers/${customer.id}/contacts/${contact.id}`,
    json('PATCH', { version: 1, position: '采购经理', email: null }),
  );
  expect(changed.status).toBe(200);
  expect((await changed.json()).data).toMatchObject({
    position: '采购经理',
    email: null,
    version: 2,
  });
  expect(
    (
      await admin.fetch(
        `/customers/${customer.id}/contacts/${contact.id}`,
        json('PATCH', { version: 1, name: 'Stale' }),
      )
    ).status,
  ).toBe(409);
});

test('declares every API route and valid response schemas', async ({
  testApp,
}) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);
  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);
  expect(document.paths?.['/api/customers']?.get?.operationId).toBe(
    'listCustomers',
  );
  expect(
    document.paths?.['/api/customers/{customerId}/contacts/{contactId}']?.patch
      ?.responses,
  ).toHaveProperty('409');
});
