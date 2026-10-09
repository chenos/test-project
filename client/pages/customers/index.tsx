import { useTranslation } from '@nocobase/i18n/client';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { useCallback, useMemo, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/data-table';
import { useUrlSearch } from '@/hooks/use-url-search';
import { OptionSelect } from './option-select.js';
import { EmptyRecords, ErrorFeedback, LoadingRows } from './feedback.js';
import { Pager } from './pager.js';
import { TextCell } from './text-cell.js';
import { useOwners } from './use-owners.js';
import { useResource } from './use-resource.js';
import type { Customer, ListResult } from './types.js';

export default function CustomersPage() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);
  const { searchParams, search, text, inputProps, updateParams, clear } =
    useUrlSearch({ resetParams: ['page'] });
  const owners = useOwners();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const ownerId = searchParams.get('ownerId') || undefined;
  const status = ['potential', 'active', 'lost'].find(
    (v) => v === searchParams.get('status'),
  );
  const grade = ['A', 'B', 'C'].find((v) => v === searchParams.get('grade'));
  const sort =
    searchParams.get('sort') === 'updatedAtAsc'
      ? 'updatedAtAsc'
      : 'updatedAtDesc';
  const result = useResource<ListResult<Customer>>('customers', {
    search: search || undefined,
    ownerId,
    status,
    grade,
    page,
    pageSize: 20,
    sort,
  });
  const { reload, setData, data } = result;
  const onCustomerSaved = useCallback(
    (record: Customer, created = false) => {
      if (data) {
        const matches =
          (!search ||
            record.companyName
              .toLocaleLowerCase()
              .includes(search.toLocaleLowerCase())) &&
          (!ownerId || record.ownerId === ownerId) &&
          (!status || record.status === status) &&
          (!grade || record.grade === grade);
        const existing = data.data.some((row) => row.id === record.id);
        const rows = data.data.filter((row) => row.id !== record.id);
        if (matches && (created || existing)) {
          if (sort === 'updatedAtDesc') rows.unshift(record);
          else rows.push(record);
        }
        setData({
          ...data,
          data: rows.slice(0, data.meta.pageSize),
          meta: {
            ...data.meta,
            total:
              data.meta.total +
              (created && matches ? 1 : existing && !matches ? -1 : 0),
          },
        });
      }
      reload();
    },
    [data, setData, reload, search, ownerId, status, grade, sort],
  );
  // Child contexts use the stable reload callback. Saving updates the visible row before requerying.
  const context = useMemo(
    () => ({ reload, onCustomerSaved }),
    [reload, onCustomerSaved],
  );
  const filtered = Boolean(text || ownerId || status || grade);
  const clearFilters = () => {
    clear((p) => {
      for (const key of ['ownerId', 'status', 'grade', 'page']) p.delete(key);
    });
    searchRef.current?.focus();
  };
  function changeFilter(key: string, value: string) {
    updateParams((p) => {
      if (value !== 'all') p.set(key, value);
      else p.delete(key);
      p.delete('page');
    });
  }
  const newAction = (
    <Button
      nativeButton={false}
      render={<Link to={{ pathname: 'new', search: location.search }} />}
    >
      <Plus data-icon='inline-start' />
      {t('customers.new')}
    </Button>
  );
  const columns: ColumnDef<Customer>[] = [
    {
      accessorKey: 'companyName',
      header: t('customers.fields.companyName'),
      cell: ({ row }) => (
        <TextCell value={row.original.companyName} to={row.original.id} />
      ),
    },
    {
      accessorKey: 'industry',
      header: t('customers.fields.industry'),
      cell: ({ row }) => <TextCell value={row.original.industry} />,
    },
    {
      accessorKey: 'ownerId',
      header: t('customers.fields.ownerId'),
      cell: ({ row }) => <TextCell value={row.original.owner?.name ?? null} />,
    },
    {
      accessorKey: 'status',
      header: t('customers.fields.status'),
      cell: ({ row }) => (
        <Badge variant='secondary'>
          {t(`customers.statuses.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      accessorKey: 'grade',
      header: t('customers.fields.grade'),
      cell: ({ row }) =>
        row.original.grade ? (
          <Badge variant='outline'>{row.original.grade}</Badge>
        ) : (
          '—'
        ),
    },
    {
      accessorKey: 'updatedAt',
      header: () => (
        <Button
          variant='ghost'
          size='sm'
          onClick={() => {
            updateParams((p) => {
              p.set(
                'sort',
                sort === 'updatedAtDesc' ? 'updatedAtAsc' : 'updatedAtDesc',
              );
              p.delete('page');
            });
          }}
        >
          {t('customers.fields.updatedAt')}
          {sort === 'updatedAtDesc' ? (
            <ArrowDown data-icon='inline-end' />
          ) : (
            <ArrowUp data-icon='inline-end' />
          )}
        </Button>
      ),
      cell: ({ row }) =>
        new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(row.original.updatedAt)),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          variant='ghost'
          size='sm'
          nativeButton={false}
          render={
            <Link
              to={{
                pathname: `edit/${row.original.id}`,
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
    <PageContainer>
      <PageHeader
        title={t('customers.title')}
        description={t('customers.description')}
        actions={
          result.data && (result.data.meta.total > 0 || filtered)
            ? newAction
            : undefined
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          data-customer-return-focus
          ref={searchRef}
          {...inputProps}
          aria-label={t('customers.search')}
          placeholder={t('customers.search')}
          className='w-full sm:max-w-xs'
        />
        <div className='w-full sm:w-40'>
          <OptionSelect
            label={t('customers.fields.ownerId')}
            value={ownerId ?? 'all'}
            options={[
              {
                value: 'all',
                label:
                  t('customers.fields.ownerId') + ': ' + t('customers.all'),
              },
              ...(owners.data ?? []).map((o) => ({
                value: o.id,
                label: o.name,
              })),
            ]}
            onChange={(v) => changeFilter('ownerId', v)}
            disabled={!owners.data}
          />
        </div>
        <div className='w-full sm:w-40'>
          <OptionSelect
            label={t('customers.fields.status')}
            value={status ?? 'all'}
            options={[
              {
                value: 'all',
                label: t('customers.fields.status') + ': ' + t('customers.all'),
              },
              ...(['potential', 'active', 'lost'] as const).map((s) => ({
                value: s,
                label: t(`customers.statuses.${s}`),
              })),
            ]}
            onChange={(v) => changeFilter('status', v)}
          />
        </div>
        <div className='w-full sm:w-40'>
          <OptionSelect
            label={t('customers.fields.grade')}
            value={grade ?? 'all'}
            options={[
              {
                value: 'all',
                label: t('customers.fields.grade') + ': ' + t('customers.all'),
              },
              ...['A', 'B', 'C'].map((s) => ({ value: s, label: s })),
            ]}
            onChange={(v) => changeFilter('grade', v)}
          />
        </div>
        {filtered ? (
          <Button variant='ghost' onClick={clearFilters}>
            {t('customers.clear')}
          </Button>
        ) : null}
        {result.loading && result.data ? <Spinner /> : null}
      </div>
      {owners.error ? (
        <ErrorFeedback error={owners.error} retry={owners.reload} />
      ) : null}
      {result.error ? (
        <ErrorFeedback
          error={result.error}
          retry={() => {
            result.reload();
            searchRef.current?.focus();
          }}
        />
      ) : !result.data ? (
        <LoadingRows />
      ) : !result.data.data.length ? (
        <EmptyRecords
          filtered={filtered}
          action={
            filtered ? (
              <Button variant='outline' onClick={clearFilters}>
                {t('customers.clear')}
              </Button>
            ) : (
              newAction
            )
          }
        />
      ) : (
        <>
          <DataTable data={result.data.data} columns={columns} />
          <Pager
            page={page}
            total={result.data.meta.total}
            onChange={(n) => updateParams((p) => p.set('page', String(n)))}
            disabled={result.loading}
          />
        </>
      )}
      <Outlet context={context} />
    </PageContainer>
  );
}
