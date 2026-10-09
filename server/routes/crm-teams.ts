import { z } from 'zod';
import { Hono } from 'hono';
import {
  authenticationToken,
  userAdministrationServiceToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponses,
  apiErrorResponse,
  apiValidator,
  dataResponse,
  listResponse,
  defineApiRoutes,
  describeRoute,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { crmTeamServiceToken } from '../providers/crm.js';
import {
  CrmNotFound,
  CrmConflict,
  CrmInvalidInput,
} from '../providers/crm-teams.js';
import {
  ListQuery,
  OwnerSchema,
  PageMeta,
  TeamBody,
  TeamPatch,
  MemberBody,
  TeamSchema,
  MemberSchema,
  MemberDetail,
} from './schemas.js';

const id = z.string().min(1).max(64);
export const crmTeamApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono<AuthEnv & AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const service = app.container.resolve(crmTeamServiceToken);
    const users = app.container.resolve(userAdministrationServiceToken);
    for (const path of [
      '/crmTeams',
      '/crmTeams/*',
      '/crmTeamMembers',
      '/crmTeamMembers/*',
      '/crmTeamUsers',
    ])
      router.use(path, auth.required(), authz.middleware(), async (c, next) => {
        // PM-6 assigns team administration to the existing root administrator only.
        if (!(await c.get('authz').snapshot()).unrestricted)
          throw new ApiError({
            status: 'PERMISSION_DENIED',
            reason: 'CRM_ADMIN_REQUIRED',
            domain: 'crm',
            message: 'Team administration requires unrestricted access.',
          });
        await c.get('authz').require({
          resource: { type: 'settings', id: 'crm-teams' },
          action: c.req.method === 'GET' ? 'read' : 'update',
        });
        await next();
      });
    router.onError((e) => {
      if (
        e instanceof CrmNotFound ||
        ('code' in e && e.code === 'RECORD_NOT_FOUND')
      )
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'CRM_NOT_FOUND',
          domain: 'crm',
          message: 'The record does not exist.',
        });
      if (
        e instanceof CrmConflict ||
        ('code' in e &&
          ['VERSION_CONFLICT', 'UNIQUE_CONSTRAINT_VIOLATION'].includes(
            String(e.code),
          ))
      )
        throw new ApiError({
          status: 'ABORTED',
          httpStatus: 409,
          reason: 'VERSION_CONFLICT',
          domain: 'crm',
          message: 'The record changed. Reload before saving.',
        });
      if (e instanceof CrmInvalidInput)
        throw new ApiError({
          status: 'INVALID_ARGUMENT',
          reason: 'CRM_INVALID_MEMBERSHIP',
          domain: 'crm',
          message:
            'Select an enabled user and team; explicitly confirm a team change.',
        });
      throw e;
    });
    const detailErrors = {
      ...apiErrorResponses,
      404: apiErrorResponse(404),
      409: apiErrorResponse(409),
    };
    router.get(
      '/crmTeams',
      describeRoute({
        tags: ['CRM teams'],
        summary: 'List sales teams',
        operationId: 'listCrmTeams',
        responses: {
          200: listResponse(TeamSchema, PageMeta),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ListQuery),
      async (c) => {
        const q = c.req.valid('query');
        return c.json(await service.listTeams(q.page, q.pageSize));
      },
    );
    router.post(
      '/crmTeams',
      describeRoute({
        tags: ['CRM teams'],
        summary: 'Create a sales team',
        operationId: 'createCrmTeam',
        responses: { 201: dataResponse(TeamSchema), ...apiErrorResponses },
      }),
      apiValidator('json', TeamBody),
      async (c) =>
        c.json(
          {
            data: await service.createTeam(
              c.req.valid('json'),
              c.get('auth')!.user.id,
            ),
          },
          201,
        ),
    );
    router.patch(
      '/crmTeams/:teamId',
      describeRoute({
        tags: ['CRM teams'],
        summary: 'Update a sales team',
        operationId: 'updateCrmTeam',
        responses: { 200: dataResponse(TeamSchema), ...detailErrors },
      }),
      apiValidator('param', z.object({ teamId: id })),
      apiValidator('json', TeamPatch),
      async (c) =>
        c.json({
          data: await service.updateTeam(
            c.req.valid('param').teamId,
            c.req.valid('json'),
            c.get('auth')!.user.id,
          ),
        }),
    );
    router.get(
      '/crmTeamMembers/:userId',
      describeRoute({
        tags: ['CRM teams'],
        summary: 'Inspect sales membership and affected customers',
        operationId: 'getCrmTeamMember',
        responses: { 200: dataResponse(MemberDetail), ...apiErrorResponses },
      }),
      apiValidator('param', z.object({ userId: id })),
      async (c) =>
        c.json({ data: await service.member(c.req.valid('param').userId) }),
    );
    router.put(
      '/crmTeamMembers/:userId',
      describeRoute({
        tags: ['CRM teams'],
        summary: 'Set sales team membership',
        operationId: 'setCrmTeamMember',
        responses: { 200: dataResponse(MemberSchema), ...detailErrors },
      }),
      apiValidator('param', z.object({ userId: id })),
      apiValidator('json', MemberBody),
      async (c) =>
        c.json({
          data: await service.setMember(
            c.req.valid('param').userId,
            c.req.valid('json'),
            c.get('auth')!.user.id,
          ),
        }),
    );
    router.get(
      '/crmTeamUsers',
      describeRoute({
        tags: ['CRM teams'],
        summary: 'List enabled sales membership candidates',
        operationId: 'listCrmTeamUsers',
        responses: {
          200: listResponse(OwnerSchema, PageMeta),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ListQuery),
      async (c) => {
        const q = c.req.valid('query');
        const page = await users.list({ ...q, status: 'enabled' });
        return c.json({
          data: page.items.map(({ id, name }) => ({ id, name })),
          meta: { page: q.page, pageSize: q.pageSize, total: page.total },
        });
      },
    );
    return new Hono().route('/', router);
  });
