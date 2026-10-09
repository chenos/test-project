import { useRef, useState } from 'react';
import { useParams, useOutletContext } from 'react-router';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useResource } from './use-resource.js';
import { useOwners } from './use-owners.js';
import { OptionSelect } from './option-select.js';
import { ErrorFeedback, LoadingRows } from './feedback.js';
import type { Customer, CustomerContext } from './types.js';
import { useConfirmation } from '../crm-teams/confirm.js';

export default function TransferPage() {
  const { t } = useTranslation();
  const stateRef = useRef({ dirty: false, pending: false });
  const confirmation = useConfirmation();
  return (
    <>
      <RouteDialog
        title={t('crmTeams.transferTitle')}
        description={t('crmTeams.transferDescription')}
        className='sm:max-w-md'
        beforeClose={async () =>
          !stateRef.current.pending &&
          (!stateRef.current.dirty ||
            (await confirmation.request(
              t('customers.discard.title'),
              t('customers.discard.description'),
            )))
        }
      >
        <TransferForm
          onState={(dirty, pending) => {
            stateRef.current = { dirty, pending };
          }}
        />
      </RouteDialog>
      {confirmation.dialog}
    </>
  );
}
function TransferForm({
  onState,
}: {
  onState: (dirty: boolean, pending: boolean) => void;
}) {
  const { t } = useTranslation();
  const { customerId = '' } = useParams();
  const parent = useOutletContext<CustomerContext>();
  const { close } = useRouteOverlay();
  const api = useApiClient();
  const toaster = useToaster();
  const access = useCan({
    resource: { type: 'composite', id: 'crm.customers' },
    action: 'transfer',
  });
  const record = useResource<{ data: Customer }>(
    `customers/${encodeURIComponent(customerId)}`,
  );
  const owners = useOwners();
  const [ownerId, setOwnerId] = useState('');
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<unknown>();
  const ownerRef = useRef<HTMLButtonElement>(null);
  const row = record.data?.data;
  const terminal =
    error instanceof ApiClientError && [403, 404, 409].includes(error.status);
  if (access.isPending) return <LoadingRows />;
  if (!access.can)
    return (
      <Alert variant='destructive'>
        <AlertDescription>{t('customers.errors.forbidden')}</AlertDescription>
      </Alert>
    );
  if (record.error || owners.error)
    return (
      <ErrorFeedback
        error={record.error ?? owners.error}
        retry={() => {
          record.reload();
          owners.reload();
        }}
      />
    );
  if (!row || !owners.data) return <LoadingRows />;
  async function save() {
    setSubmitted(true);
    if (!ownerId) {
      ownerRef.current?.focus();
      return;
    }
    setPending(true);
    onState(true, true);
    setError(undefined);
    try {
      const { data } = await api.request<{ data: Customer }>({
        path: `customers/${encodeURIComponent(customerId)}/transferOwner`,
        method: 'POST',
        json: { ownerId, version: row!.version },
      });
      parent.onCustomerSaved(data);
      onState(false, false);
      toaster.show({
        type: 'success',
        title: t('crmTeams.transferred', { name: data.companyName }),
      });
      await close();
    } catch (e) {
      setError(e);
      if (e instanceof ApiClientError && e.status === 404) parent.reload();
    } finally {
      setPending(false);
      onState(Boolean(ownerId), false);
    }
  }
  return (
    <form
      noValidate
      className='flex flex-col gap-6'
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending && !terminal) void save();
      }}
    >
      {error ? (
        error instanceof ApiClientError && error.status === 409 ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {t('crmTeams.conflict')}{' '}
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  setError(undefined);
                  record.reload();
                }}
              >
                {t('customers.loadLatest')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <ErrorFeedback error={error} />
        )
      ) : null}
      <FieldGroup>
        <Field data-invalid={submitted && !ownerId}>
          <FieldLabel>{t('customers.fields.ownerId')} *</FieldLabel>
          <OptionSelect
            label={t('customers.fields.ownerId')}
            value={ownerId}
            required
            invalid={submitted && !ownerId}
            inputRef={ownerRef}
            disabled={pending || terminal}
            onChange={(id) => {
              setOwnerId(id);
              onState(Boolean(id), false);
            }}
            options={[
              { value: '', label: t('crmTeams.selectUser') },
              ...owners.data.map((u) => ({ value: u.id, label: u.name })),
            ]}
          />
          <FieldError>
            {submitted && !ownerId ? t('customers.errors.owner') : null}
          </FieldError>
        </Field>
      </FieldGroup>
      <div className='flex flex-wrap justify-end gap-2'>
        <Button
          type='button'
          variant='outline'
          disabled={pending}
          onClick={() => void close()}
        >
          {t('actions.cancel')}
        </Button>
        <Button type='submit' disabled={pending || terminal}>
          {pending ? <Spinner data-icon='inline-start' /> : null}
          {t('crmTeams.transfer')}
        </Button>
      </div>
    </form>
  );
}
