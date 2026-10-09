import { randomUUID } from 'node:crypto';
import { type DatabaseManager, type DatabaseConnection } from '@nocobase/db';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { UserAdministrationService } from '@nocobase/app-plugin-authentication/server';
import { serializeDates } from './serialize-dates.js';

export interface CrmTeam {
  id: string;
  name: string;
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  updatedById: string;
}
export interface CrmMember {
  id: string;
  userId: string;
  teamId: string;
  active: boolean;
  isManager: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  updatedById: string;
}
export class CrmNotFound extends Error {}
export class CrmConflict extends Error {}
export class CrmInvalidInput extends Error {}

/** Internal trusted lookups. Public directory responses project only id/name. */
export class CrmTeamService {
  constructor(
    readonly db: DatabaseManager,
    readonly users: UserAdministrationService,
    readonly authz: AppAuthorization,
  ) {}

  async teamOwners(userId: string): Promise<string[]> {
    const member = await this.db
      .repository<CrmMember>('crmTeamMembers')
      .findOne({ filter: { userId, active: true, isManager: true } });
    if (
      !member ||
      !(await this.db
        .repository('crmTeams')
        .exists({ filter: { id: member.teamId, active: true } }))
    )
      return [];
    const members = await this.db
      .repository<CrmMember>('crmTeamMembers')
      .findMany({ filter: { teamId: member.teamId, active: true } });
    const ids = members.map((m) => m.userId);
    if (!ids.length) return [];
    const result: string[] = [];
    for (let page = 1; ; page++) {
      const users = await this.users.list({
        userIds: ids,
        status: 'enabled',
        page,
        pageSize: 100,
      });
      result.push(...users.items.map((u) => u.id));
      if (page * 100 >= users.total || !users.items.length) return result;
    }
  }

  async listTeams(page: number, pageSize: number) {
    const repo = this.db.repository<CrmTeam>('crmTeams');
    const [data, total] = await Promise.all([
      repo.findMany({
        sort: (s) => s.field('id').asc(),
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      repo.count(),
    ]);
    return { data: data.map(serializeDates), meta: { page, pageSize, total } };
  }

  async member(userId: string) {
    const member = await this.db
      .repository<CrmMember>('crmTeamMembers')
      .findOne({ filter: { userId } });
    const affectedCustomers = await this.db
      .repository('customers')
      .count({ filter: { ownerId: userId } });
    const sets = await this.authz.permissionSets.getEffective({
      principal: { type: 'user', id: userId },
    });
    const hasManagerSet = sets.some((s) => s.key === 'crm.salesManager');
    return {
      member: member ? serializeDates(member) : null,
      affectedCustomers,
      inconsistent:
        Boolean(member?.active && member.isManager) !== hasManagerSet,
    };
  }

  private async audit(
    connection: DatabaseConnection,
    actorId: string,
    subjectId: string,
    kind: string,
    before: unknown,
    after: unknown,
  ) {
    await connection.repository('crmTeamChanges').createOne({
      values: {
        id: randomUUID(),
        actorId,
        subjectId,
        kind,
        before: before ? JSON.stringify(before) : null,
        after: JSON.stringify(after),
        createdAt: new Date().toISOString(),
      },
    });
  }

  private async notify(
    connection: DatabaseConnection,
    teams: string[],
    extra: string[] = [],
  ) {
    const members = await connection
      .repository<CrmMember>('crmTeamMembers')
      .findMany({
        filter: (f) => f.or(teams.map((id) => f.string('teamId').eq(id))),
      });
    const api = this.authz.permissionSets.withTransaction(connection);
    for (const id of new Set([...extra, ...members.map((m) => m.userId)]))
      await api.notifyAssignmentsChanged({ type: 'user', id });
  }

  async createTeam(input: { name: string; active: boolean }, actorId: string) {
    return this.db.transaction(async (connection) => {
      const now = new Date().toISOString();
      const result = await connection
        .repository<CrmTeam>('crmTeams')
        .createOne({
          values: {
            ...input,
            id: randomUUID(),
            createdAt: now,
            updatedAt: now,
            createdById: actorId,
            updatedById: actorId,
          },
        });
      await this.audit(
        connection,
        actorId,
        result.record.id,
        'team.create',
        null,
        result.record,
      );
      return serializeDates(result.record);
    });
  }

  async updateTeam(
    id: string,
    input: { name: string; active: boolean; version: number },
    actorId: string,
  ) {
    return this.db.transaction(async (connection) => {
      const repo = connection.repository<CrmTeam>('crmTeams');
      const before = await repo.findOne({ filter: { id } });
      if (!before) throw new CrmNotFound();
      const { version, ...fields } = input;
      const result = await repo.updateOne({
        filter: { id },
        ifVersion: version,
        values: {
          ...fields,
          updatedAt: new Date().toISOString(),
          updatedById: actorId,
        },
      });
      await this.audit(
        connection,
        actorId,
        id,
        'team.update',
        before,
        result.record,
      );
      await this.notify(connection, [id]);
      return serializeDates(result.record);
    });
  }

  async setMember(
    userId: string,
    input: {
      teamId: string;
      active: boolean;
      isManager: boolean;
      version: number;
      confirmImpact: boolean;
    },
    actorId: string,
  ) {
    return this.db.transaction(async (connection) => {
      const user = await this.users.withConnection(connection).get(userId);
      if (!user || user.disabledAt || user.kind !== 'person')
        throw new CrmInvalidInput();
      if (
        !(await connection.repository('crmTeams').exists({
          filter: {
            id: input.teamId,
            ...(input.active ? { active: true } : {}),
          },
        }))
      )
        throw new CrmInvalidInput();
      const repo = connection.repository<CrmMember>('crmTeamMembers');
      const before = await repo.findOne({ filter: { userId } });
      if ((before?.version ?? 0) !== input.version) throw new CrmConflict();
      if (before && before.teamId !== input.teamId && !input.confirmImpact)
        throw new CrmInvalidInput();
      const now = new Date().toISOString();
      const fields = {
        teamId: input.teamId,
        active: input.active,
        isManager: input.isManager,
        updatedAt: now,
        updatedById: actorId,
      };
      const result = before
        ? await repo.updateOne({
            filter: { id: before.id },
            ifVersion: input.version,
            values: fields,
          })
        : await repo.createOne({
            values: {
              ...fields,
              id: randomUUID(),
              userId,
              createdAt: now,
              createdById: actorId,
            },
          });
      await this.audit(
        connection,
        actorId,
        userId,
        'member.update',
        before,
        result.record,
      );
      await this.notify(
        connection,
        [...new Set([input.teamId, ...(before ? [before.teamId] : [])])],
        [userId],
      );
      return serializeDates(result.record);
    });
  }
}
