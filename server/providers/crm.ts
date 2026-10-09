import { defineRecordAccess } from '@nocobase/authorization/core';
import {
  authorizationToken,
  anyScope,
  condition,
} from '@nocobase/app-plugin-authorization/server';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import {
  customersResource,
  contactsResource,
  ownersResource,
} from './crm-resources.js';
import { CrmTeamService } from './crm-teams.js';

export const crmTeamServiceToken: ServiceToken<CrmTeamService> =
  createServiceToken<CrmTeamService>('app/crm-teams');
export default class CrmProvider extends ServiceProvider<Application> {
  readonly name = 'app/crm';
  override register() {
    this.app.container.singleton(
      crmTeamServiceToken,
      () =>
        new CrmTeamService(
          this.app.container.resolve(databaseManagerToken),
          this.app.container.resolve(userAdministrationServiceToken),
          this.app.container.resolve(authorizationToken),
        ),
    );
  }
  override async boot() {
    const authz = this.app.container.resolve(authorizationToken);
    const db = this.app.container.resolve(databaseManagerToken);
    const teams = this.app.container.resolve(crmTeamServiceToken);
    for (const name of ['customers', 'contacts', 'user'])
      authz.database.collections.add({
        name,
        title: name,
        actions: name === 'user' ? ['read'] : ['read', 'create', 'update'],
      });
    authz.ui.sections.add({ name: 'crm', title: 'CRM', parent: 'business' });
    for (const resource of [
      customersResource.build(),
      contactsResource.build(),
      ownersResource.build(),
    ])
      authz.ui.place(authz.compositeResources.define(resource), {
        section: 'crm',
      });
    // Scope resolvers return database filters, never post-filtered public datasets.
    const ids = (field: string, values: string[]) =>
      anyScope(values.map((id) => condition(field, '$eq', id)));
    const parent = async (ownerIds: string[]) => {
      if (!ownerIds.length) return false;
      const customers = await db
        .repository<{ id: string }>('customers')
        .findMany({
          filter: (f) => f.or(ownerIds.map((id) => f.string('ownerId').eq(id))),
          select: (s) => s.fields('id'),
        });
      return ids(
        'customerId',
        customers.map((c) => c.id),
      );
    };
    authz.recordAccess.define(
      defineRecordAccess('crm.parentOwned', (r) =>
        r
          .title({ key: 'crmPermissions.ownContacts', ns: 'test-project' })
          .collections('contacts')
          .resolver(({ principal }) =>
            principal.type === 'user' ? parent([principal.id]) : false,
          ),
      ),
    );
    authz.recordAccess.define(
      defineRecordAccess('crm.myTeam', (r) =>
        r
          .title({ key: 'crmPermissions.team', ns: 'test-project' })
          .collections('customers', 'contacts')
          .resolver(async ({ principal, collection }) => {
            if (principal.type !== 'user') return false;
            const owners = await teams.teamOwners(principal.id);
            return collection === 'contacts'
              ? parent(owners)
              : ids('ownerId', owners);
          }),
      ),
    );
    authz.recordAccess.define(
      defineRecordAccess('crm.selfUser', (r) =>
        r
          .title({ key: 'crmPermissions.self', ns: 'test-project' })
          .collections('user')
          .resolver(({ principal }) =>
            principal.type === 'user'
              ? condition('id', '$eq', principal.id)
              : false,
          ),
      ),
    );
    authz.recordAccess.define(
      defineRecordAccess('crm.teamUsers', (r) =>
        r
          .title({ key: 'crmPermissions.teamUsers', ns: 'test-project' })
          .collections('user')
          .resolver(async ({ principal }) =>
            principal.type === 'user'
              ? ids('id', await teams.teamOwners(principal.id))
              : false,
          ),
      ),
    );
    authz.settings.add({
      id: 'crm-teams',
      title: { key: 'crmTeams.title', ns: 'test-project' },
      actions: [{ name: 'read' }, { name: 'update' }],
    });
    authz.ui.sections.add({
      name: 'crm.admin',
      title: 'CRM',
      parent: 'administration',
    });
    authz.ui.place(
      { type: 'settings', id: 'crm-teams' },
      { section: 'crm.admin' },
    );
  }
}
