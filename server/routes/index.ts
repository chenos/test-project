import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { customerApiRoutes } from './customers.js';
import { crmTeamApiRoutes } from './crm-teams.js';

const routes: readonly AppRouteContribution<Application>[] = [
  customerApiRoutes,
  crmTeamApiRoutes,
];

export default routes;
