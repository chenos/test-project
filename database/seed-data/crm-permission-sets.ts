import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import {
  customersResource,
  contactsResource,
  ownersResource,
} from '../../server/providers/crm-resources.ts';

function job(key: string, manager: boolean) {
  const customers = manager ? 'crm.myTeam' : 'recordsIOwn';
  const contacts = manager ? 'crm.myTeam' : 'crm.parentOwned';
  const owners = manager ? 'crm.teamUsers' : 'crm.selfUser';
  return definePermissionSet(key)
    .title({
      key: manager ? 'crmTeams.manager' : 'crmTeams.sales',
      ns: 'test-project',
    })
    .grant({
      resource: { type: 'page', id: 'customers' },
      actions: [{ action: 'access' }],
    })
    .grant(
      customersResource.reference().grant({
        view: { customers },
        create: { customers, owners },
        edit: { customers },
        ...(manager ? { transfer: { customers, owners } } : {}),
      }),
    )
    .grant(
      contactsResource.reference().grant({
        view: { customers, contacts },
        create: { customers, contacts },
        edit: { customers, contacts },
      }),
    )
    .grant(ownersResource.reference().grant({ view: { owners } }))
    .build();
}
export const crmPermissionSets = [
  job('crm.sales', false),
  job('crm.salesManager', true),
];
