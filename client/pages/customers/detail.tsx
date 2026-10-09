import { ApiClientError } from '@nocobase/app-client';
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
  const newContact = (
    <Button
      nativeButton={false}
      render={
        <Link to={{ pathname: 'contacts/new', search: location.search }} />
      }
    >
      <Plus data-icon='inline-start' />
      {t('contacts.new')}
    </Button>
  );
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
      cell: ({ row: r }) => (
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
      ),
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
              <Button
                data-customer-return-focus
                variant='outline'
                nativeButton={false}
                render={
                  <Link to={{ pathname: 'edit', search: location.search }} />
                }
              >
                {t('customers.edit')}
              </Button>
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
