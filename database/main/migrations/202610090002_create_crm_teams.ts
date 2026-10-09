import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202610090002_create_crm_teams',
  async up({ builder }) {
    await builder.createCollection('crmTeams', (c) => {
      c.string('id', { length: 64 }).primary();
      c.string('name', { length: 200 }).notNull();
      c.boolean('active').notNull().defaultTo(true);
      c.datetime('createdAt').notNull();
      c.datetime('updatedAt').notNull();
      c.string('createdById', { length: 64 }).notNull();
      c.string('updatedById', { length: 64 }).notNull();
      c.integer('version').notNull().defaultTo(1);
      c.optimisticLock('version');
    });
    await builder.createCollection('crmTeamMembers', (c) => {
      c.string('id', { length: 64 }).primary();
      c.string('userId', { length: 64 }).notNull().unique();
      c.string('teamId', { length: 64 }).notNull();
      c.boolean('active').notNull().defaultTo(true);
      c.boolean('isManager').notNull().defaultTo(false);
      c.datetime('createdAt').notNull();
      c.datetime('updatedAt').notNull();
      c.string('createdById', { length: 64 }).notNull();
      c.string('updatedById', { length: 64 }).notNull();
      c.integer('version').notNull().defaultTo(1);
      c.optimisticLock('version');
      c.belongsTo('team', 'crmTeams', {
        foreignKey: 'teamId',
        sourceKey: 'id',
        targetKey: 'id',
        constraints: false,
      });
      c.foreignKey('teamId', {
        references: { collection: 'crmTeams', fields: ['id'] },
        onDelete: 'restrict',
      });
      c.foreignKey('userId', {
        references: { collection: 'user', fields: ['id'] },
        onDelete: 'restrict',
      });
      c.index(['teamId', 'active']);
    });
    await builder.createCollection('crmTeamChanges', (c) => {
      c.string('id', { length: 64 }).primary();
      c.string('actorId', { length: 64 }).notNull();
      c.string('subjectId', { length: 64 }).notNull();
      c.string('kind', { length: 32 }).notNull();
      c.text('before').nullable();
      c.text('after').notNull();
      c.datetime('createdAt').notNull();
      c.index(['subjectId', 'createdAt']);
    });
  },
  async down({ builder }) {
    await builder.dropCollection('crmTeamChanges');
    await builder.dropCollection('crmTeamMembers');
    await builder.dropCollection('crmTeams');
  },
});
export default migration;
