import { invalidFields } from './field-errors.js';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';
import { z } from 'zod';
import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ErrorFeedback, LoadingRows } from './feedback.js';
import { useResource } from './use-resource.js';
import type { Contact, CustomerContext } from './types.js';

export default function ContactEditPage() {
  const { t } = useTranslation();
  const { customerId = '', contactId } = useParams();
  const pendingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const onPending = useCallback((value: boolean) => {
    pendingRef.current = value;
    setSubmitting(value);
  }, []);
  return (
    <RouteDialog
      title={t(contactId ? 'contacts.editTitle' : 'contacts.new')}
      className='sm:max-w-md'
      beforeClose={() => !pendingRef.current}
      footer={<ContactFooter submitting={submitting} ready={ready} />}
    >
      <ContactBody
        customerId={customerId}
        contactId={contactId}
        onReady={setReady}
        onPending={onPending}
      />
    </RouteDialog>
  );
}
function ContactFooter({
  submitting,
  ready,
}: {
  submitting: boolean;
  ready: boolean;
}) {
  const { t } = useTranslation();
  const { contactId } = useParams();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form='contact-form' disabled={submitting || !ready}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting
          ? t('customers.saving')
          : contactId
            ? t('actions.save')
            : t('customers.create')}
      </Button>
    </>
  );
}
function ContactBody({
  customerId,
  contactId,
  onPending,
  onReady,
}: {
  customerId: string;
  contactId?: string;
  onReady: (value: boolean) => void;
  onPending: (value: boolean) => void;
}) {
  return contactId ? (
    <ExistingContact
      customerId={customerId}
      contactId={contactId}
      onPending={onPending}
      onReady={onReady}
    />
  ) : (
    <ContactForm
      customerId={customerId}
      onPending={onPending}
      onReady={onReady}
    />
  );
}
function ExistingContact({
  customerId,
  contactId,
  onPending,
  onReady,
}: {
  customerId: string;
  contactId: string;
  onReady: (value: boolean) => void;
  onPending: (value: boolean) => void;
}) {
  const record = useResource<{ data: Contact }>(
    `customers/${customerId}/contacts/${contactId}`,
  );
  const parent = useOutletContext<CustomerContext>();
  const { reload: reloadParent } = parent;
  useEffect(() => {
    if (record.error instanceof ApiClientError && record.error.status === 404)
      reloadParent();
  }, [record.error, reloadParent]);
  return record.error ? (
    <ErrorFeedback error={record.error} retry={record.reload} />
  ) : !record.data ? (
    <LoadingRows />
  ) : (
    <ContactForm
      key={`${contactId}:${record.data.data.version}`}
      customerId={customerId}
      contact={record.data.data}
      onPending={onPending}
      onReady={onReady}
      reload={record.reload}
    />
  );
}
function ContactForm({
  customerId,
  contact,
  onPending,
  onReady,
  reload,
}: {
  customerId: string;
  contact?: Contact;
  onReady: (value: boolean) => void;
  onPending: (value: boolean) => void;
  reload?: () => void;
}) {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const parent = useOutletContext<CustomerContext>();
  const [error, setError] = useState<unknown>();
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('customers.errors.required'))
          .max(200, t('customers.errors.tooLong')),
        position: z.string().trim().max(200, t('customers.errors.tooLong')),
        phone: z.string().trim().max(100, t('customers.errors.tooLong')),
        email: z
          .union([
            z.literal(''),
            z.email({ error: t('customers.errors.invalidEmail') }),
          ])
          .refine((v) => v.length <= 320, t('customers.errors.tooLong')),
      }),
    [t],
  );
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: contact?.name ?? '',
      position: contact?.position ?? '',
      phone: contact?.phone ?? '',
      email: contact?.email ?? '',
    },
  });
  const submit = form.handleSubmit(async (values) => {
    setError(undefined);
    onPending(true);
    try {
      const response = await api.request<{ data: Contact }>({
        path: `customers/${customerId}/contacts${contact ? `/${contact.id}` : ''}`,
        method: contact ? 'PATCH' : 'POST',
        json: {
          ...values,
          position: values.position || null,
          phone: values.phone || null,
          email: values.email || null,
          ...(contact ? { version: contact.version } : {}),
        },
      });
      parent.onContactSaved?.(response.data, !contact);
      toaster.show({
        type: 'success',
        title: t(contact ? 'contacts.saved' : 'contacts.created', {
          name: response.data.name,
        }),
      });
      onPending(false);
      await close();
    } catch (e) {
      const fields = invalidFields(e).filter(
        (field): field is 'name' | 'position' | 'phone' | 'email' =>
          ['name', 'position', 'phone', 'email'].includes(field),
      );
      if (fields.length) {
        for (const [index, field] of fields.entries())
          form.setError(
            field,
            {
              type: 'server',
              message: t(
                field === 'email'
                  ? 'customers.errors.invalidEmail'
                  : 'customers.errors.invalidValue',
              ),
            },
            { shouldFocus: index === 0 },
          );
        window.setTimeout(() => form.setFocus(fields[0]), 0);
      } else setError(e);
      if (e instanceof ApiClientError && e.status === 404) parent.reload();
    } finally {
      onPending(false);
    }
  });
  const fields = ['name', 'position', 'phone', 'email'] as const;
  const terminal =
    error instanceof ApiClientError && [403, 404, 409].includes(error.status);
  useEffect(() => {
    onReady(!terminal);
    return () => onReady(false);
  }, [onReady, terminal]);
  return (
    <form
      id='contact-form'
      noValidate
      onSubmit={(e) => {
        if (!terminal) void submit(e);
      }}
      className='flex flex-col gap-4'
    >
      {error ? (
        error instanceof ApiClientError && error.status === 409 ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {t('customers.errors.conflict')}{' '}
              <Button variant='outline' type='button' onClick={reload}>
                {t('customers.loadLatest')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <ErrorFeedback error={error} />
        )
      ) : null}
      <FieldGroup>
        {fields.map((key) => (
          <Controller
            key={key}
            control={form.control}
            name={key}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`contact-${key}`}>
                  {t(`contacts.fields.${key}`)}
                  {key === 'name' ? <span aria-hidden='true'>*</span> : null}
                </FieldLabel>
                <Input
                  {...field}
                  id={`contact-${key}`}
                  type={key === 'email' ? 'email' : 'text'}
                  inputMode={key === 'phone' ? 'tel' : undefined}
                  disabled={form.formState.isSubmitting || terminal}
                  aria-invalid={fieldState.invalid}
                  aria-required={key === 'name'}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        ))}
      </FieldGroup>
    </form>
  );
}
