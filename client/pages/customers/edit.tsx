import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router';
import { BackButton } from '@/components/back-button';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { CustomerForm } from './customer-form.js';
import { ErrorFeedback, LoadingRows } from './feedback.js';
import { useResource } from './use-resource.js';
import type { Customer, CustomerContext } from './types.js';

export default function CustomerEditPage() {
  const { customerId } = useParams();
  return customerId ? (
    <ExistingCustomer customerId={customerId} />
  ) : (
    <EditFrame />
  );
}
function ExistingCustomer({ customerId }: { customerId: string }) {
  const record = useResource<{ data: Customer }>(`customers/${customerId}`);
  const parent = useOutletContext<CustomerContext>();
  const { reload: reloadParent } = parent;
  useEffect(() => {
    if (record.error instanceof ApiClientError && record.error.status === 404)
      reloadParent();
  }, [record.error, reloadParent]);
  return (
    <EditFrame
      editing
      customer={record.data?.data}
      loading={!record.data && !record.error}
      error={record.error}
      reload={record.reload}
    />
  );
}
function EditFrame({
  editing,
  customer,
  loading,
  error,
  reload = () => undefined,
}: {
  editing?: boolean;
  customer?: Customer;
  loading?: boolean;
  error?: unknown;
  reload?: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const parent = useOutletContext<CustomerContext>();
  const stateRef = useRef({ dirty: false, pending: false });
  const [discard, setDiscard] = useState(false);
  const onStateChange = useCallback(
    (s: { dirty: boolean; pending: boolean }) => {
      stateRef.current = s;
    },
    [],
  );
  const leave = () => {
    void navigate(
      { pathname: '..', search: location.search },
      { replace: true },
    );
    window.setTimeout(
      () =>
        Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-customer-return-focus]',
          ),
        )
          .find((element) => !element.closest('[inert]'))
          ?.focus(),
      0,
    );
  };
  const cancel = () => {
    if (stateRef.current.pending) return;
    if (stateRef.current.dirty) setDiscard(true);
    else leave();
  };
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (stateRef.current.dirty || stateRef.current.pending)
        event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  return (
    <RouteChildPage>
      <PageContainer>
        <div
          onClickCapture={(e) => {
            e.preventDefault();
            cancel();
          }}
        >
          <BackButton />
        </div>
        <PageHeader
          title={t(editing ? 'customers.editTitle' : 'customers.new')}
          description={t('customers.description')}
        />
        <div className='flex max-w-2xl flex-col gap-6'>
          {error ? (
            <ErrorFeedback error={error} retry={reload} />
          ) : loading ? (
            <LoadingRows />
          ) : (
            <CustomerForm
              key={customer ? `${customer.id}:${customer.version}` : 'new'}
              customer={customer}
              onStateChange={onStateChange}
              onCancel={cancel}
              onLoadLatest={reload}
              onSaved={(row) => {
                parent.onCustomerSaved(row, !editing);
                leave();
              }}
            />
          )}
        </div>
      </PageContainer>
      <AlertDialog open={discard} onOpenChange={setDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('customers.discard.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('customers.discard.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant='outline' onClick={() => setDiscard(false)}>
              {t('customers.discard.keep')}
            </Button>
            <Button variant='destructive' onClick={leave}>
              {t('customers.discard.confirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RouteChildPage>
  );
}
