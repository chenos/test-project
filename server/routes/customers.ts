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
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type Context } from 'hono';
import { crmPolicies } from './crm-authorization.js';
import {
  CustomerService,
  CustomerNotFound,
  InvalidOwner,
} from '../providers/customers.js';
import {
  CustomerSchema,
  ContactSchema,
  OwnerSchema,
  PageMeta,
  CustomerBody,
  CustomerPatch,
  OwnerTransferBody,
  EligibilitySchema,
  CustomerQuery,
  ContactBody,
  ContactPatch,
  CustomerParams,
  ContactParams,
  ListQuery,
} from './schemas.js';

export const customerApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono<AuthEnv & AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const db = app.container.resolve(databaseManagerToken);
    const users = app.container.resolve(userAdministrationServiceToken);
    async function execute<T>(
      c: Context<AuthEnv & AuthorizationEnv>,
      resource: string,
      action: string,
      collections: string[],
      run: (service: CustomerService) => Promise<T>,
    ) {
      const policies = await crmPolicies(
        c.get('authz'),
        resource,
        action,
        collections,
      );
      return db.transaction((connection) =>
        run(
          new CustomerService(
            connection,
            policies,
            users.withConnection(connection),
          ),
        ),
      );
    }
    const protectedPaths = ['/customers', '/customers/*', '/customerOwners'];
    for (const path of protectedPaths) {
      router.use(path, auth.required(), authz.middleware());
    }
    router.onError((error) => {
      if (
        error instanceof CustomerNotFound ||
        ('code' in error && error.code === 'RECORD_NOT_FOUND')
      )
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'CUSTOMER_RECORD_NOT_FOUND',
          domain: 'customers',
          message: 'The record does not exist.',
        });
      if (error instanceof InvalidOwner)
        throw new ApiError({
          status: 'INVALID_ARGUMENT',
          reason: 'INVALID_OWNER',
          domain: 'customers',
          message: 'Select an existing owner.',
          fieldViolations: [
            { field: 'ownerId', description: 'Select an existing user.' },
          ],
        });
      if ('code' in error && error.code === 'VERSION_CONFLICT')
        throw new ApiError({
          status: 'ABORTED',
          httpStatus: 409,
          reason: 'VERSION_CONFLICT',
          domain: 'customers',
          message: 'The record changed. Load its latest version.',
        });
      throw error;
    });
    const singleErrors = { ...apiErrorResponses, 404: apiErrorResponse(404) };
    const patchErrors = { ...singleErrors, 409: apiErrorResponse(409) };
    router.get(
      '/customerOwners',
      describeRoute({
        tags: ['Customers'],
        summary: 'List customer owners',
        operationId: 'listCustomerOwners',
        responses: {
          200: listResponse(OwnerSchema, PageMeta),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ListQuery),
      async (c) => {
        const q = c.req.valid('query');
        return c.json(
          await execute(c, 'crm.customerOwners', 'view', ['user'], (s) =>
            s.owners(q.page, q.pageSize),
          ),
        );
      },
    );
    router.get(
      '/customers',
      describeRoute({
        tags: ['Customers'],
        summary: 'List customers',
        operationId: 'listCustomers',
        responses: {
          200: listResponse(CustomerSchema, PageMeta),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', CustomerQuery),
      async (c) =>
        c.json(
          await execute(c, 'crm.customers', 'view', ['customers'], (s) =>
            s.list(c.req.valid('query')),
          ),
        ),
    );
    router.post(
      '/customers',
      describeRoute({
        tags: ['Customers'],
        summary: 'Create a customer',
        operationId: 'createCustomer',
        responses: { 201: dataResponse(CustomerSchema), ...apiErrorResponses },
      }),
      apiValidator('json', CustomerBody),
      async (c) =>
        c.json(
          {
            data: await execute(
              c,
              'crm.customers',
              'create',
              ['customers', 'user'],
              (s) => s.create(c.req.valid('json'), c.get('auth')!.user.id),
            ),
          },
          201,
        ),
    );
    router.get(
      '/customers/:customerId',
      describeRoute({
        tags: ['Customers'],
        summary: 'Get a customer',
        operationId: 'getCustomer',
        responses: { 200: dataResponse(CustomerSchema), ...singleErrors },
      }),
      apiValidator('param', CustomerParams),
      async (c) =>
        c.json({
          data: await execute(c, 'crm.customers', 'view', ['customers'], (s) =>
            s.get(c.req.valid('param').customerId),
          ),
        }),
    );
    router.patch(
      '/customers/:customerId',
      describeRoute({
        tags: ['Customers'],
        summary: 'Update a customer',
        operationId: 'updateCustomer',
        responses: { 200: dataResponse(CustomerSchema), ...patchErrors },
      }),
      apiValidator('param', CustomerParams),
      apiValidator('json', CustomerPatch),
      async (c) =>
        c.json({
          data: await execute(c, 'crm.customers', 'edit', ['customers'], (s) =>
            s.update(c.req.valid('param').customerId, c.req.valid('json')),
          ),
        }),
    );
    router.get(
      '/customers/:customerId/contacts',
      describeRoute({
        tags: ['Contacts'],
        summary: 'List customer contacts',
        operationId: 'listCustomerContacts',
        responses: {
          200: listResponse(ContactSchema, PageMeta),
          ...singleErrors,
        },
      }),
      apiValidator('param', CustomerParams),
      apiValidator('query', ListQuery),
      async (c) => {
        const q = c.req.valid('query');
        return c.json(
          await execute(
            c,
            'crm.contacts',
            'view',
            ['customers', 'contacts'],
            (s) =>
              s.listContacts(
                c.req.valid('param').customerId,
                q.page,
                q.pageSize,
              ),
          ),
        );
      },
    );
    router.post(
      '/customers/:customerId/contacts',
      describeRoute({
        tags: ['Contacts'],
        summary: 'Create a customer contact',
        operationId: 'createCustomerContact',
        responses: { 201: dataResponse(ContactSchema), ...singleErrors },
      }),
      apiValidator('param', CustomerParams),
      apiValidator('json', ContactBody),
      async (c) =>
        c.json(
          {
            data: await execute(
              c,
              'crm.contacts',
              'create',
              ['customers', 'contacts'],
              (s) =>
                s.createContact(
                  c.req.valid('param').customerId,
                  c.req.valid('json'),
                  c.get('auth')!.user.id,
                ),
            ),
          },
          201,
        ),
    );
    router.get(
      '/customers/:customerId/contacts/:contactId',
      describeRoute({
        tags: ['Contacts'],
        summary: 'Get a customer contact',
        operationId: 'getCustomerContact',
        responses: { 200: dataResponse(ContactSchema), ...singleErrors },
      }),
      apiValidator('param', ContactParams),
      async (c) => {
        const p = c.req.valid('param');
        return c.json({
          data: await execute(
            c,
            'crm.contacts',
            'view',
            ['customers', 'contacts'],
            (s) => s.getContact(p.customerId, p.contactId),
          ),
        });
      },
    );
    router.patch(
      '/customers/:customerId/contacts/:contactId',
      describeRoute({
        tags: ['Contacts'],
        summary: 'Update a customer contact',
        operationId: 'updateCustomerContact',
        responses: { 200: dataResponse(ContactSchema), ...patchErrors },
      }),
      apiValidator('param', ContactParams),
      apiValidator('json', ContactPatch),
      async (c) => {
        const p = c.req.valid('param');
        return c.json({
          data: await execute(
            c,
            'crm.contacts',
            'edit',
            ['customers', 'contacts'],
            (s) =>
              s.updateContact(p.customerId, p.contactId, c.req.valid('json')),
          ),
        });
      },
    );
    router.get(
      '/customers/:customerId/transferEligibility',
      describeRoute({
        tags: ['Customers'],
        summary: 'Check customer owner transfer eligibility',
        operationId: 'getCustomerTransferEligibility',
        responses: {
          200: dataResponse(EligibilitySchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', CustomerParams),
      async (c) => {
        try {
          await execute(
            c,
            'crm.customers',
            'transfer',
            ['customers', 'user'],
            (s) => s.get(c.req.valid('param').customerId),
          );
          return c.json({ data: { eligible: true } });
        } catch (e) {
          if (e instanceof CustomerNotFound)
            return c.json({ data: { eligible: false } });
          throw e;
        }
      },
    );
    router.post(
      '/customers/:customerId/transferOwner',
      describeRoute({
        tags: ['Customers'],
        summary: 'Transfer customer ownership',
        operationId: 'transferCustomerOwner',
        responses: { 200: dataResponse(CustomerSchema), ...patchErrors },
      }),
      apiValidator('param', CustomerParams),
      apiValidator('json', OwnerTransferBody),
      async (c) => {
        const input = c.req.valid('json');
        return c.json({
          data: await execute(
            c,
            'crm.customers',
            'transfer',
            ['customers', 'user'],
            (s) =>
              s.transfer(
                c.req.valid('param').customerId,
                input.ownerId,
                input.version,
              ),
          ),
        });
      },
    );
    return new Hono().route('/', router);
  });
