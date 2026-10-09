import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import CustomersPage from '../../client/pages/customers/index.js';
import CustomerEditPage from '../../client/pages/customers/edit.js';
import CustomerDetailPage from '../../client/pages/customers/detail.js';
import ContactEditPage from '../../client/pages/customers/contact-edit.js';
import enUS from '../../client/locales/en-US.js';
import metadata from '../../package.json' with { type: 'json' };

const { api, toaster, refresh } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn() },
  refresh: vi.fn(),
}));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ session: { user: { id: 'admin' } }, refresh }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => ({ can: true, isPending: false }),
  useAuthorizationRevision: () => 0,
}));
const runtime = await createTestI18nRuntime({
  application: { namespace: metadata.name, resources: enUS },
});
const customer = {
  id: 'c1',
  companyName: 'Example',
  ownerId: 'admin',
  owner: { id: 'admin', name: 'Admin' },
  industry: null,
  size: null,
  source: null,
  grade: null,
  status: 'potential',
  notes: null,
  version: 1,
  createdAt: '2026-10-09T00:00:00Z',
  updatedAt: '2026-10-09T00:00:00Z',
  createdById: 'admin',
};
const list = (data: object[]) => ({
  data,
  meta: { page: 1, pageSize: 20, total: data.length },
});
function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/customers',
        Component: CustomersPage,
        children: [
          { path: 'new', Component: CustomerEditPage },
          {
            path: ':customerId',
            Component: CustomerDetailPage,
            children: [
              { path: 'contacts/new', Component: ContactEditPage },
              { path: 'edit', Component: CustomerEditPage },
              { path: 'contacts/:contactId/edit', Component: ContactEditPage },
            ],
          },
        ],
      },
    ],
    { initialEntries: [url] },
  );
  render(
    <TestI18nProvider runtime={runtime} namespace={metadata.name}>
      <RouterProvider router={router} />
    </TestI18nProvider>,
  );
  return router;
}
beforeEach(() => {
  vi.clearAllMocks();
  api.request.mockImplementation(
    ({ path, method }: { path: string; method?: string }) => {
      if (method === 'POST')
        return Promise.resolve({
          data: path.endsWith('contacts')
            ? { id: 'p1', name: 'Jane' }
            : customer,
        });
      if (path === 'customerOwners')
        return Promise.resolve(list([{ id: 'admin', name: 'Admin' }]));
      if (path === 'customers/c1') return Promise.resolve({ data: customer });
      if (path === 'customers/c1/transferEligibility')
        return Promise.resolve({ data: { eligible: true } });
      return Promise.resolve(list([]));
    },
  );
});
it('distinguishes first-use empty from no matches and keeps search in the URL', async () => {
  const router = renderAt('/customers');
  expect(await screen.findByText('No customers yet')).toBeInTheDocument();
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Search company names' }),
    'Acme',
  );
  await waitFor(() => expect(router.state.location.search).toContain('q=Acme'));
  expect(await screen.findByText('No matching customers')).toBeInTheDocument();
  await userEvent.click(
    screen.getAllByRole('button', { name: 'Clear filters' })[0],
  );
  await waitFor(() => expect(router.state.location.search).toBe(''));
});
it('requires a company name, creates with defaults and returns to the filtered parent', async () => {
  const router = renderAt('/customers/new?q=Acme&grade=A');
  const input = await screen.findByLabelText(/Company name/);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
  );
  expect(
    screen
      .getByRole('heading', { name: 'Customers', hidden: true })
      .closest('[inert]'),
  ).not.toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  expect(await screen.findByText('Enter a value.')).toBeInTheDocument();
  await userEvent.type(input, 'Acme');
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/customers'),
  );
  expect(router.state.location.search).toBe('?q=Acme&grade=A');
  expect(api.request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'POST',
      json: expect.objectContaining({
        companyName: 'Acme',
        ownerId: 'admin',
        status: 'potential',
        grade: null,
      }),
    }),
  );
  expect(toaster.show).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'success' }),
  );
});
it('shows forbidden without retry', async () => {
  api.request.mockRejectedValue(
    new ApiClientError('Forbidden', {
      status: 403,
      method: 'GET',
      url: '/api/customers',
    }),
  );
  renderAt('/customers');
  expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent(
    'You do not have permission',
  );
  expect(
    screen.queryByRole('button', { name: 'Retry' }),
  ).not.toBeInTheDocument();
});
it('validates a contact email and saves under the fixed parent, preserving list filters', async () => {
  const router = renderAt('/customers/c1/contacts/new?grade=A');
  expect(
    await screen.findByRole('dialog', { name: 'New contact' }),
  ).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText(/Name/), 'Jane');
  await userEvent.type(screen.getByLabelText('Email'), 'bad');
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  expect(
    await screen.findByText('Enter a valid email address.'),
  ).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText('Email'));
  await userEvent.type(screen.getByLabelText('Phone'), '+86 021 ext 8');
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/customers/c1'),
  );
  expect(router.state.location.search).toBe('?grade=A');
  expect(api.request).toHaveBeenCalledWith(
    expect.objectContaining({
      path: 'customers/c1/contacts',
      method: 'POST',
      json: expect.objectContaining({
        name: 'Jane',
        email: null,
        phone: '+86 021 ext 8',
      }),
    }),
  );
});

it('offers session recovery after 401', async () => {
  api.request.mockRejectedValue(
    new ApiClientError('Unauthorized', {
      status: 401,
      method: 'GET',
      url: '/api/customers',
    }),
  );
  renderAt('/customers');
  await userEvent.click(
    (await screen.findAllByRole('button', { name: 'Sign in again' }))[0],
  );
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('maps a server email violation inline and focuses email without closing the dialog', async () => {
  const original = api.request.getMockImplementation()!;
  api.request.mockImplementation((request) =>
    request.method === 'POST'
      ? Promise.reject(
          new ApiClientError('Invalid', {
            status: 400,
            method: 'POST',
            url: '/api/customers/c1/contacts',
            payload: {
              error: {
                fieldViolations: [
                  { field: 'email', description: 'Invalid email' },
                ],
              },
            },
          }),
        )
      : original(request),
  );
  renderAt('/customers/c1/contacts/new');
  await userEvent.type(await screen.findByLabelText(/Name/), 'Jane');
  await userEvent.type(screen.getByLabelText('Email'), 'jane@example.test');
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  expect(
    await screen.findByText('Enter a valid email address.'),
  ).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText('Email')).toHaveFocus());
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
it('shows a newly created contact immediately while reconciliation is still pending', async () => {
  const original = api.request.getMockImplementation()!;
  let contactsReads = 0;
  api.request.mockImplementation((request) =>
    request.path === 'customers/c1/contacts' &&
    !request.method &&
    ++contactsReads > 1
      ? new Promise(() => {})
      : original(request),
  );
  renderAt('/customers/c1/contacts/new');
  await userEvent.type(await screen.findByLabelText(/Name/), 'Jane');
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  await waitFor(() =>
    expect(screen.getByText('Jane', { exact: true })).toBeInTheDocument(),
  );
  expect(screen.queryByText('No contacts yet')).not.toBeInTheDocument();
});
it('returns focus to the visible detail action after cancelling nested customer editing', async () => {
  const router = renderAt('/customers/c1/edit?grade=A');
  await screen.findByLabelText(/Company name/);
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/customers/c1'),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus(),
  );
  expect(router.state.location.search).toBe('?grade=A');
});
it('refreshes the contacts list when a contact edit returns 404', async () => {
  const original = api.request.getMockImplementation()!;
  api.request.mockImplementation((request) =>
    request.path === 'customers/c1/contacts/missing'
      ? Promise.reject(
          new ApiClientError('Missing', {
            status: 404,
            method: 'GET',
            url: '/api/customers/c1/contacts/missing',
          }),
        )
      : original(request),
  );
  renderAt('/customers/c1/contacts/missing/edit');
  await screen.findByText(/This record does not exist/);
  await waitFor(() =>
    expect(
      api.request.mock.calls.filter(
        ([request]) => request.path === 'customers/c1/contacts',
      ),
    ).toHaveLength(2),
  );
});

it('shows a created customer immediately without waiting for a second list request', async () => {
  const original = api.request.getMockImplementation()!;
  let listReads = 0;
  api.request.mockImplementation((request) =>
    request.path === 'customers' &&
    !request.method &&
    !request.query?.exactName &&
    ++listReads > 1
      ? new Promise(() => {})
      : original(request),
  );
  const router = renderAt('/customers/new');
  await userEvent.type(await screen.findByLabelText(/Company name/), 'Example');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  // The covering route can replace table elements while navigation commits.
  // Query the current DOM after returning, rather than retaining a stale node.
  await waitFor(() => {
    expect(router.state.location.pathname).toBe('/customers');
    expect(screen.getByRole('link', { name: 'Example' })).toBeInTheDocument();
    expect(listReads).toBeGreaterThan(1);
  });
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'Search company names' }),
    ).toHaveFocus(),
  );
});

it('maps a customer field violation inline without exposing server text', async () => {
  const original = api.request.getMockImplementation()!;
  api.request.mockImplementation((request) =>
    request.method === 'POST'
      ? Promise.reject(
          new ApiClientError('Invalid', {
            status: 400,
            method: 'POST',
            url: '/api/customers',
            payload: {
              error: {
                fieldViolations: [
                  {
                    field: 'body.companyName',
                    description: 'Internal validator detail',
                  },
                ],
              },
            },
          }),
        )
      : original(request),
  );
  renderAt('/customers/new');
  const company = await screen.findByLabelText(/Company name/);
  await userEvent.type(company, 'Example');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  expect(
    await screen.findByText('Check this value and try again.'),
  ).toBeInTheDocument();
  await waitFor(() => expect(company).toHaveFocus());
  expect(company).toHaveValue('Example');
  expect(
    screen.queryByText('Internal validator detail'),
  ).not.toBeInTheDocument();
});

it('refreshes the parent after a customer write returns 404 and blocks keyboard resubmission', async () => {
  const original = api.request.getMockImplementation()!;
  api.request.mockImplementation((request) =>
    request.method === 'PATCH'
      ? Promise.reject(
          new ApiClientError('Missing', {
            status: 404,
            method: 'PATCH',
            url: '/api/customers/c1',
          }),
        )
      : original(request),
  );
  renderAt('/customers/c1/edit');
  const company = await screen.findByLabelText(/Company name/);
  const listReads = api.request.mock.calls.filter(
    ([request]) => request.path === 'customers',
  ).length;
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText(/This record does not exist/);
  await waitFor(() =>
    expect(
      api.request.mock.calls.filter(([request]) => request.path === 'customers')
        .length,
    ).toBeGreaterThan(listReads),
  );
  expect(company).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  await act(async () => {
    fireEvent.submit(company.closest('form')!);
  });
  expect(
    api.request.mock.calls.filter(([request]) => request.method === 'PATCH'),
  ).toHaveLength(1);
});

it('maps a contact name violation inline and preserves the dialog', async () => {
  const original = api.request.getMockImplementation()!;
  api.request.mockImplementation((request) =>
    request.method === 'POST'
      ? Promise.reject(
          new ApiClientError('Invalid', {
            status: 400,
            method: 'POST',
            url: '/api/customers/c1/contacts',
            payload: {
              error: {
                fieldViolations: [
                  { field: 'body.name', description: 'Internal detail' },
                ],
              },
            },
          }),
        )
      : original(request),
  );
  renderAt('/customers/c1/contacts/new');
  const name = await screen.findByLabelText(/Name/);
  await userEvent.type(name, 'Test Contact');
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  expect(
    await screen.findByText('Check this value and try again.'),
  ).toBeInTheDocument();
  await waitFor(() => expect(name).toHaveFocus());
  expect(
    screen.getByRole('dialog', { name: 'New contact' }),
  ).toBeInTheDocument();
});
