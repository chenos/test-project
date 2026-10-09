import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202610090001_create_customers_contacts',
  async up({ builder }) {
    await builder.createCollection('customers', (c) => {
      c.title('客户');
      c.string('id', { length: 64 }).primary();
      c.string('companyName', { length: 200 }).notNull();
      c.string('industry', { length: 200 }).nullable();
      c.string('size', { length: 100 }).nullable();
      c.string('source', { length: 200 }).nullable();
      c.string('ownerId', { length: 64 }).notNull();
      c.enum('status', {
        values: ['potential', 'active', 'lost'],
        nullable: false,
        defaultValue: 'potential',
      });
      c.enum('grade', { values: ['A', 'B', 'C'], nullable: true });
      c.text('notes').nullable();
      c.datetime('createdAt').notNull();
      c.datetime('updatedAt').notNull();
      c.string('createdById', { length: 64 }).notNull();
      c.integer('version').notNull().defaultTo(1);
      c.optimisticLock('version');
      c.belongsTo('owner', 'user', {
        foreignKey: 'ownerId',
        sourceKey: 'id',
        targetKey: 'id',
        constraints: false,
      });
      c.belongsTo('createdBy', 'user', {
        foreignKey: 'createdById',
        sourceKey: 'id',
        targetKey: 'id',
        constraints: false,
      });
      c.foreignKey('ownerId', {
        references: { collection: 'user', fields: ['id'] },
        onDelete: 'restrict',
      });
      c.foreignKey('createdById', {
        references: { collection: 'user', fields: ['id'] },
        onDelete: 'restrict',
      });
      c.index('companyName');
      c.index(['ownerId', 'status', 'grade']);
      c.index('updatedAt');
    });
    await builder.createCollection('contacts', (c) => {
      c.title('联系人');
      c.string('id', { length: 64 }).primary();
      c.string('customerId', { length: 64 }).notNull();
      c.string('name', { length: 200 }).notNull();
      c.string('position', { length: 200 }).nullable();
      c.string('phone', { length: 100 }).nullable();
      c.string('email', { length: 320 }).nullable();
      c.datetime('createdAt').notNull();
      c.datetime('updatedAt').notNull();
      c.string('createdById', { length: 64 }).notNull();
      c.integer('version').notNull().defaultTo(1);
      c.optimisticLock('version');
      c.belongsTo('customer', 'customers', {
        foreignKey: 'customerId',
        sourceKey: 'id',
        targetKey: 'id',
        constraints: false,
      });
      c.belongsTo('createdBy', 'user', {
        foreignKey: 'createdById',
        sourceKey: 'id',
        targetKey: 'id',
        constraints: false,
      });
      c.foreignKey('customerId', {
        references: { collection: 'customers', fields: ['id'] },
        onDelete: 'restrict',
      });
      c.foreignKey('createdById', {
        references: { collection: 'user', fields: ['id'] },
        onDelete: 'restrict',
      });
      c.index(['customerId', 'updatedAt']);
    });
    await builder.alterCollection('customers', (c) => {
      c.hasMany('contacts', 'contacts', {
        foreignKey: 'customerId',
        sourceKey: 'id',
        targetKey: 'id',
        constraints: false,
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('contacts');
    await builder.dropCollection('customers');
  },
});

export default migration;
