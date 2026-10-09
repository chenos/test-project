import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { customerApiRoutes } from './customers.js';

const routes: readonly AppRouteContribution<Application>[] = [
  customerApiRoutes,
];

export default routes;
