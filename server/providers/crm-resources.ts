import { defineCompositeResource } from '@nocobase/authorization/core';
import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';

const customerData = defineDatabasePermission((p) =>
  p
    .collection('customers')
    .read((r) =>
      r
        .fields(
          'id',
          'companyName',
          'industry',
          'size',
          'source',
          'ownerId',
          'status',
          'grade',
          'notes',
          'createdAt',
          'updatedAt',
          'createdById',
          'version',
        )
        .relation('owner', (owner) => owner.fields('id', 'name')),
    ),
);
const customerFields = [
  'companyName',
  'industry',
  'size',
  'source',
  'status',
  'grade',
  'notes',
  'updatedAt',
] as const;
const ownerData = defineDatabasePermission((p) =>
  p.collection('user').read(['id', 'name']),
);
export const customersResource = defineCompositeResource('crm.customers', (r) =>
  r
    .title({ key: 'crmPermissions.customers', ns: 'test-project' })
    .action('view', (a) =>
      a
        .title({ key: 'crmPermissions.view', ns: 'test-project' })
        .grant('customers', customerData),
    )
    .action('create', (a) =>
      a
        .title({ key: 'crmPermissions.create', ns: 'test-project' })
        .grant(
          'customers',
          customerData.create([
            ...customerFields,
            'id',
            'ownerId',
            'createdAt',
            'createdById',
          ]),
        )
        .grant('owners', ownerData),
    )
    .action('edit', (a) =>
      a
        .title({ key: 'crmPermissions.edit', ns: 'test-project' })
        .grant('customers', customerData.update(customerFields)),
    )
    .action('transfer', (a) =>
      a
        .title({ key: 'crmPermissions.transfer', ns: 'test-project' })
        .grant('customers', customerData.update(['ownerId', 'updatedAt']))
        .grant('owners', ownerData),
    ),
);
export const ownersResource = defineCompositeResource(
  'crm.customerOwners',
  (r) =>
    r
      .title({ key: 'crmPermissions.owners', ns: 'test-project' })
      .action('view', (a) =>
        a
          .title({ key: 'crmPermissions.view', ns: 'test-project' })
          .grant('owners', ownerData),
      ),
);
const contactData = defineDatabasePermission((p) =>
  p
    .collection('contacts')
    .read([
      'id',
      'customerId',
      'name',
      'position',
      'phone',
      'email',
      'createdAt',
      'updatedAt',
      'createdById',
      'version',
    ]),
);
const contactFields = [
  'name',
  'position',
  'phone',
  'email',
  'updatedAt',
] as const;
export const contactsResource = defineCompositeResource('crm.contacts', (r) =>
  r
    .title({ key: 'crmPermissions.contacts', ns: 'test-project' })
    .action('view', (a) =>
      a
        .title({ key: 'crmPermissions.view', ns: 'test-project' })
        .grant('customers', customerData)
        .grant('contacts', contactData),
    )
    .action('create', (a) =>
      a
        .title({ key: 'crmPermissions.create', ns: 'test-project' })
        .grant('customers', customerData)
        .grant(
          'contacts',
          contactData.create([
            ...contactFields,
            'id',
            'customerId',
            'createdAt',
            'createdById',
          ]),
        ),
    )
    .action('edit', (a) =>
      a
        .title({ key: 'crmPermissions.edit', ns: 'test-project' })
        .grant('customers', customerData)
        .grant('contacts', contactData.update(contactFields)),
    ),
);
