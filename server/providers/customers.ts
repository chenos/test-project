import { randomUUID } from 'node:crypto';
import type { DatabaseManager, RepositoryFilter } from '@nocobase/db';
import type { z } from 'zod';
import type {
  CustomerBody,
  CustomerPatch,
  CustomerQuery,
  ContactBody,
  ContactPatch,
  CustomerView,
  ContactView,
} from '../routes/schemas.js';

// Drivers can return timezone-less UTC datetimes. Keep the HTTP contract explicit and
// avoid interpreting SQLite timestamps in the server or browser's local timezone.
function serializeDates<T extends { createdAt: string; updatedAt: string }>(
  row: T,
): T {
  const iso = (value: string) =>
    new Date(
      /[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`,
    ).toISOString();
  return {
    ...row,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export class CustomerNotFound extends Error {}
export class InvalidOwner extends Error {}

// PM-6 adds business scopes. Until then routes require unrestricted administration;
// the repositories below cannot be reached by a merely signed-in user.
export class CustomerService {
  constructor(private readonly db: DatabaseManager) {}

  private customers() {
    return this.db.repository<CustomerView>('customers').withPolicy({
      read: true,
      create: true,
      update: true,
      delete: false,
    });
  }

  private contacts() {
    return this.db.repository<ContactView>('contacts').withPolicy({
      read: true,
      create: true,
      update: true,
      delete: false,
    });
  }

  async list(input: z.infer<typeof CustomerQuery>) {
    const filter: RepositoryFilter<CustomerView> = (f) => {
      const nodes = [];
      if (input.search)
        nodes.push(f.string('companyName').includes(input.search));
      if (input.exactName)
        nodes.push(f.string('companyName').eq(input.exactName));
      if (input.ownerId) nodes.push(f.string('ownerId').eq(input.ownerId));
      if (input.status) nodes.push(f.string('status').eq(input.status));
      if (input.grade) nodes.push(f.string('grade').eq(input.grade));
      return f.and(nodes);
    };
    const repository = this.customers();
    const [data, total] = await Promise.all([
      repository.findMany({
        filter,
        select: (s) =>
          s
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
            .include('owner', (o) => o.fields('id', 'name')),
        sort: (s) =>
          input.sort === 'updatedAtAsc'
            ? [s.field('updatedAt').asc(), s.field('id').asc()]
            : [s.field('updatedAt').desc(), s.field('id').desc()],
        limit: input.pageSize,
        offset: (input.page - 1) * input.pageSize,
      }),
      repository.count({ filter }),
    ]);
    return {
      data: data.map(serializeDates),
      meta: { page: input.page, pageSize: input.pageSize, total },
    };
  }

  async get(customerId: string) {
    const row = await this.customers().findOne({
      filter: { id: customerId },
      select: (s) =>
        s
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
          .include('owner', (o) => o.fields('id', 'name')),
    });
    if (!row) throw new CustomerNotFound();
    return serializeDates(row);
  }

  async owners(page: number, pageSize: number) {
    const users = this.db.repository<{ id: string; name: string }>('user');
    const [data, total] = await Promise.all([
      users.findMany({
        select: (s) => s.fields('id', 'name'),
        sort: (s) => s.field('id').asc(),
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      users.count(),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  private async assertOwner(ownerId: string) {
    if (!(await this.db.repository('user').exists({ filter: { id: ownerId } })))
      throw new InvalidOwner();
  }

  async create(input: z.infer<typeof CustomerBody>, actorId: string) {
    const ownerId = input.ownerId ?? actorId;
    await this.assertOwner(ownerId);
    const now = new Date();
    const result = await this.customers().createOne({
      values: {
        ...input,
        ownerId,
        id: randomUUID(),
        createdById: actorId,
        industry: input.industry || null,
        size: input.size || null,
        source: input.source || null,
        grade: input.grade ?? null,
        notes: input.notes || null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    });
    return this.get(result.record.id);
  }

  async update(customerId: string, input: z.infer<typeof CustomerPatch>) {
    await this.get(customerId);
    if (input.ownerId) await this.assertOwner(input.ownerId);
    const { version, ...values } = input;
    await this.customers().updateOne({
      filter: { id: customerId },
      ifVersion: version,
      values: { ...values, updatedAt: new Date().toISOString() },
    });
    return this.get(customerId);
  }

  async listContacts(customerId: string, page: number, pageSize: number) {
    await this.get(customerId);
    const repository = this.contacts();
    const filter = { customerId };
    const [data, total] = await Promise.all([
      repository.findMany({
        filter,
        sort: (s) => [s.field('updatedAt').desc(), s.field('id').desc()],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      repository.count({ filter }),
    ]);
    return { data: data.map(serializeDates), meta: { page, pageSize, total } };
  }

  async getContact(customerId: string, contactId: string) {
    await this.get(customerId);
    const row = await this.contacts().findOne({
      filter: { id: contactId, customerId },
    });
    if (!row) throw new CustomerNotFound();
    return serializeDates(row);
  }

  async createContact(
    customerId: string,
    input: z.infer<typeof ContactBody>,
    actorId: string,
  ) {
    await this.get(customerId);
    const now = new Date().toISOString();
    const result = await this.contacts().createOne({
      values: {
        ...input,
        id: randomUUID(),
        customerId,
        createdById: actorId,
        position: input.position || null,
        phone: input.phone || null,
        email: input.email || null,
        createdAt: now,
        updatedAt: now,
      },
    });
    return serializeDates(result.record);
  }

  async updateContact(
    customerId: string,
    contactId: string,
    input: z.infer<typeof ContactPatch>,
  ) {
    await this.getContact(customerId, contactId);
    const { version, ...values } = input;
    const result = await this.contacts().updateOne({
      filter: { id: contactId, customerId },
      ifVersion: version,
      values: { ...values, updatedAt: new Date().toISOString() },
    });
    return serializeDates(result.record);
  }
}
