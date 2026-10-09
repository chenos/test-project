import { ApiClientError } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { BackButton } from '@/components/back-button';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DataTable } from '@/components/data-table';
import {
  ErrorFeedback,
  EmptyRecords,
  LoadingRows,
  DetailSkeleton,
} from './feedback.js';
import { useResource } from './use-resource.js';
import { useReturnFocus } from './use-return-focus.js';
import { TextCell } from './text-cell.js';
import { Pager } from './pager.js';
import type {
  Customer,
  Contact,
  CustomerContext,
  ListResult,
} from './types.js';

export default function CustomerDetailPage() {
  useReturnFocus();
  const { customerId = '' } = useParams();
  const { t } = useTranslation();
  const editAccess = useCan({
    resource: { type: 'composite', id: 'crm.customers' },
    action: 'edit',
  });
  const transferAccess = useCan({
    resource: { type: 'composite', id: 'crm.customers' },
    action: 'transfer',
  });
  const contactCreate = useCan({
    resource: { type: 'composite', id: 'crm.contacts' },
    action: 'create',
  });
  const contactEdit = useCan({
    resource: { type: 'composite', id: 'crm.contacts' },
    action: 'edit',
  });
  const location = useLocation();
  const parent = useOutletContext<CustomerContext>();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('contactsPage')) || 1);
  const customer = useResource<{ data: Customer }>(`customers/${customerId}`);
  const contacts = useResource<ListResult<Contact>>(
    `customers/${customerId}/contacts`,
    { page, pageSize: 20 },
  );
  const { setData: setCustomerData, reload: reloadCustomer } = customer;
  const {
    data: contactData,
    setData: setContactData,
    reload: reloadContacts,
  } = contacts;
  const { onCustomerSaved: saveParent, reload: reloadParent } = parent;
  const onCustomerSaved = useCallback(
    (row: Customer) => {
      setCustomerData({ data: row });
      saveParent(row);
    },
    [setCustomerData, saveParent],
  );
  const onContactSaved = useCallback(
    (row: Contact, created: boolean) => {
      if (contactData)
        setContactData({
          ...contactData,
          data: [row, ...contactData.data.filter((c) => c.id !== row.id)].slice(
            0,
            contactData.meta.pageSize,
          ),
          meta: {
            ...contactData.meta,
            total: contactData.meta.total + (created ? 1 : 0),
          },
        });
      reloadContacts();
    },
    [contactData, setContactData, reloadContacts],
  );
  const reloadDetail = useCallback(() => {
    reloadContacts();
    reloadCustomer();
    reloadParent();
  }, [reloadContacts, reloadCustomer, reloadParent]);
  const context = useMemo<CustomerContext>(
    () => ({
      reload: reloadDetail,
      onCustomerSaved,
      onContactSaved,
      customerId,
    }),
    [reloadDetail, onCustomerSaved, onContactSaved, customerId],
  );
  useEffect(() => {
    if (
      customer.error instanceof ApiClientError &&
      customer.error.status === 404
    )
      reloadParent();
  }, [customer.error, reloadParent]);
  const fields = [
    'companyName',
    'industry',
    'size',
    'source',
    'ownerId',
    'status',
    'grade',
    'notes',
  ] as const;
  const row = customer.data?.data;
  const backParams = new URLSearchParams(location.search);
  backParams.delete('contactsPage');
  const newContact = contactCreate.can ? (
    <Button
      nativeButton={false}
      render={
        <Link to={{ pathname: 'contacts/new', search: location.search }} />
      }
    >
      <Plus data-icon='inline-start' />
      {t('contacts.new')}
    </Button>
  ) : null;
  const columns: ColumnDef<Contact>[] = [
    {
      accessorKey: 'name',
      header: t('contacts.fields.name'),
      cell: ({ row: r }) => <TextCell value={r.original.name} />,
    },
    {
      accessorKey: 'position',
      header: t('contacts.fields.position'),
      cell: ({ row: r }) => <TextCell value={r.original.position} />,
    },
    {
      accessorKey: 'phone',
      header: t('contacts.fields.phone'),
      cell: ({ row: r }) => <TextCell value={r.original.phone} />,
    },
    {
      accessorKey: 'email',
      header: t('contacts.fields.email'),
      cell: ({ row: r }) => <TextCell value={r.original.email} />,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row: r }) =>
        contactEdit.can ? (
          <Button
            variant='ghost'
            size='sm'
            nativeButton={false}
            render={
              <Link
                to={{
                  pathname: `contacts/${r.original.id}/edit`,
                  search: location.search,
                }}
              />
            }
          >
            {t('customers.edit')}
          </Button>
        ) : null,
    },
  ];
  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton to={{ pathname: '..', search: backParams.toString() }} />
        <PageHeader
          title={row?.companyName ?? t('customers.basic')}
          actions={
            row ? (
              <div className='flex flex-wrap gap-2'>
                {transferAccess.can ? (
                  <TransferAction customerId={customerId} />
                ) : null}
                {editAccess.can ? (
                  <Button
                    data-customer-return-focus
                    variant='outline'
                    nativeButton={false}
                    render={
                      <Link
                        to={{ pathname: 'edit', search: location.search }}
                      />
                    }
                  >
                    {t('customers.edit')}
                  </Button>
                ) : null}
              </div>
            ) : undefined
          }
        />
        {customer.error ? (
          <ErrorFeedback error={customer.error} retry={customer.reload} />
        ) : !row ? (
          <DetailSkeleton />
        ) : (
          <>
            <section
              aria-label={t('customers.basic')}
              className='flex flex-col gap-4'
            >
              <h2 className='text-base font-medium'>{t('customers.basic')}</h2>
              <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3'>
                {fields.map((key) => (
                  <div key={key} className='contents'>
                    <dt className='text-sm text-muted-foreground'>
                      {t(`customers.fields.${key}`)}
                    </dt>
                    <dd className='min-w-0 text-sm break-words whitespace-pre-wrap'>
                      {key === 'status' ? (
                        <Badge variant='secondary'>
                          {t(`customers.statuses.${row.status}`)}
                        </Badge>
                      ) : key === 'grade' && row.grade ? (
                        <Badge variant='outline'>{row.grade}</Badge>
                      ) : (
                        (key === 'ownerId' ? row.owner?.name : row[key]) || '—'
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
            <section
              className='flex flex-col gap-4'
              aria-label={t('contacts.title')}
            >
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <h2 className='text-base font-medium'>{t('contacts.title')}</h2>
                {contacts.data && contacts.data.meta.total > 0
                  ? newContact
                  : null}
                {contacts.loading && contacts.data ? <Spinner /> : null}
              </div>
              {contacts.error ? (
                <ErrorFeedback error={contacts.error} retry={contacts.reload} />
              ) : !contacts.data ? (
                <LoadingRows />
              ) : contacts.data.data.length === 0 ? (
                <EmptyRecords contact action={newContact} />
              ) : (
                <>
                  <DataTable data={contacts.data.data} columns={columns} />
                  <Pager
                    page={page}
                    total={contacts.data.meta.total}
                    disabled={contacts.loading}
                    onChange={(n) =>
                      setParams(
                        (p) => {
                          p.set('contactsPage', String(n));
                          return p;
                        },
                        { replace: true },
                      )
                    }
                  />
                </>
              )}
            </section>
          </>
        )}
        <Outlet context={context} />
      </PageContainer>
    </RouteChildPage>
  );
}

function TransferAction({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const location = useLocation();
  const result = useResource<{ data: { eligible: boolean } }>(
    `customers/${encodeURIComponent(customerId)}/transferEligibility`,
  );
  if (result.data?.data.eligible)
    return (
      <Button
        variant='outline'
        nativeButton={false}
        render={<Link to={{ pathname: 'transfer', search: location.search }} />}
      >
        {t('crmTeams.transfer')}
      </Button>
    );
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} className='inline-flex' />}>
        <Button variant='outline' disabled>
          {result.loading ? <Spinner data-icon='inline-start' /> : null}
          {t('crmTeams.transfer')}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {t(result.loading ? 'status.loading' : 'crmTeams.transferUnavailable')}
      </TooltipContent>
    </Tooltip>
  );
}
