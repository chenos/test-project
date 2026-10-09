import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import CrmTeamsPage from '../../client/pages/crm-teams/index.js';
import enUS from '../../client/locales/en-US.js';
import metadata from '../../package.json' with { type: 'json' };
const { api, toaster, invalidate } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn() },
  invalidate: vi.fn(),
}));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    session: { user: { id: 'admin' } },
    refresh: vi.fn(),
  }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationRevision: () => 0,
  useAuthorizationClient: () => ({ invalidate }),
}));
const runtime = await createTestI18nRuntime({
  application: { namespace: metadata.name, resources: enUS },
});
const list = (data: object[]) => ({
  data,
  meta: { page: 1, pageSize: 100, total: data.length },
});
const team = { id: 'team1', name: 'Fictitious Team', active: true, version: 1 };
function start() {
  const router = createMemoryRouter(
    [{ path: '/settings/crm-teams', Component: CrmTeamsPage }],
    { initialEntries: ['/settings/crm-teams'] },
  );
  render(
    <TestI18nProvider runtime={runtime} namespace={metadata.name}>
      <RouterProvider router={router} />
    </TestI18nProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  api.request.mockImplementation(
    ({
      path,
      method,
      json,
    }: {
      path: string;
      method?: string;
      json?: object;
    }) => {
      if (path === 'crmTeams' && method === 'POST')
        return Promise.resolve({ data: { ...team, ...json } });
      if (path === 'crmTeams/team1' && method === 'PATCH')
        return Promise.resolve({ data: { ...team, ...json, version: 2 } });
      if (path === 'crmTeams') return Promise.resolve(list([team]));
      if (path === 'crmTeamUsers')
        return Promise.resolve(
          list([{ id: 'sales1', name: 'Fictitious Sales' }]),
        );
      if (path === 'crmTeamMembers/sales1' && method === 'PUT')
        return Promise.resolve({ data: { ...json, version: 1 } });
      if (path === 'crmTeamMembers/sales1')
        return Promise.resolve({
          data: { member: null, affectedCustomers: 2, inconsistent: false },
        });
      return Promise.reject(new Error('Unexpected fixture path'));
    },
  );
});
async function select(label: string, option: string, index = 0) {
  await userEvent.click(
    screen.getAllByRole('combobox', { name: label, exact: true })[index],
  );
  await userEvent.click(
    await screen.findByRole('option', { name: option, exact: true }),
  );
}

it('validates on submit, focuses the name and preserves character edits while saving one card', async () => {
  start();
  const name = await screen.findByLabelText('Name *');
  expect(
    screen.queryByText('Enter a name of at most 200 characters.'),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(name).toHaveFocus();
  expect(
    screen.getByText('Enter a name of at most 200 characters.'),
  ).toBeInTheDocument();
  await userEvent.type(name, 'New team');
  expect(
    screen.queryByText('Enter a name of at most 200 characters.'),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'crmTeams',
        method: 'POST',
        json: { name: 'New team', active: true },
      }),
    ),
  );
  expect(toaster.show).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Saved "New team"' }),
  );
  expect(invalidate).toHaveBeenCalled();
});
it('confirms disabling a named team and preserves drafts after a conflict', async () => {
  start();
  await screen.findByLabelText('Name *');
  await select('Team', team.name);
  await select('Status', 'Disabled');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alertdialog')).toHaveTextContent(
    'Disable "Fictitious Team"?',
  );
  expect(api.request.mock.calls.some(([req]) => req.method === 'PATCH')).toBe(
    false,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  api.request.mockImplementationOnce(() =>
    Promise.reject(
      new ApiClientError('Conflict', {
        status: 409,
        method: 'PATCH',
        url: '/api/crmTeams/team1',
        payload: { error: { reason: 'VERSION_CONFLICT' } },
      }),
    ),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(
    await screen.findByText(
      'This record changed. Load the latest version before saving.',
    ),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Name *')).toHaveValue(team.name);
});
it('loads member impact and assigns an enabled team without granting a permission set', async () => {
  start();
  await screen.findByLabelText('Name *');
  await select('User', 'Fictitious Sales');
  expect(
    await screen.findByText(
      'Affected customers: 2. Contacts follow the customer scope.',
    ),
  ).toBeInTheDocument();
  await select('Team', team.name, 1);
  const saves = screen.getAllByRole('button', { name: 'Save' });
  await userEvent.click(saves[1]);
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'crmTeamMembers/sales1',
        method: 'PUT',
        json: {
          teamId: team.id,
          active: true,
          isManager: false,
          version: 0,
          confirmImpact: false,
        },
      }),
    ),
  );
  expect(
    api.request.mock.calls.some(([req]) => req.path.includes('permissionSets')),
  ).toBe(false);
});
