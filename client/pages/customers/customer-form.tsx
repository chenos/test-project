import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { OptionSelect } from './option-select.js';
import { ErrorFeedback } from './feedback.js';
import { useOwners } from './use-owners.js';
import { invalidFields } from './field-errors.js';
import type { Customer, CustomerStatus, ListResult } from './types.js';

export function CustomerForm({
  customer,
  onSaved,
  onCancel,
  onStateChange,
  onLoadLatest,
  onMissing,
}: {
  customer?: Customer;
  onSaved: (customer: Customer) => void;
  onCancel: () => void;
  onStateChange: (state: { dirty: boolean; pending: boolean }) => void;
  onLoadLatest: () => void;
  onMissing: () => void;
}) {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { session } = useAuthentication();
  const owners = useOwners();
  const [serverError, setServerError] = useState<unknown>();
  const [duplicate, setDuplicate] = useState<{
    name: string;
    exists: boolean;
  }>();
  const schema = useMemo(
    () =>
      z.object({
        companyName: z
          .string()
          .trim()
          .min(1, t('customers.errors.required'))
          .max(200, t('customers.errors.tooLong')),
        industry: z.string().trim().max(200, t('customers.errors.tooLong')),
        size: z.string().trim().max(100, t('customers.errors.tooLong')),
        source: z.string().trim().max(200, t('customers.errors.tooLong')),
        ownerId: z.string().min(1, t('customers.errors.owner')),
        status: z.enum(['potential', 'active', 'lost']),
        grade: z.enum(['none', 'A', 'B', 'C']),
        notes: z.string().trim().max(10000, t('customers.errors.tooLong')),
      }),
    [t],
  );
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      companyName: customer?.companyName ?? '',
      industry: customer?.industry ?? '',
      size: customer?.size ?? '',
      source: customer?.source ?? '',
      ownerId: customer?.ownerId ?? session?.user.id ?? '',
      status: customer?.status ?? ('potential' satisfies CustomerStatus),
      grade: customer?.grade ?? ('none' as const),
      notes: customer?.notes ?? '',
    },
  });
  const name = useWatch({ control: form.control, name: 'companyName' });
  const { isDirty, isSubmitting } = form.formState;
  useEffect(() => {
    onStateChange({ dirty: isDirty, pending: isSubmitting });
  }, [isDirty, isSubmitting, onStateChange]);
  useEffect(() => {
    if (!name.trim()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api
        .request<ListResult<Customer>>({
          path: 'customers',
          query: { exactName: name.trim(), pageSize: 2 },
          signal: controller.signal,
        })
        .then(
          (response) => {
            if (!controller.signal.aborted)
              setDuplicate({
                name,
                exists: response.data.some((row) => row.id !== customer?.id),
              });
          },
          () => {
            /* A duplicate hint must never prevent an otherwise valid write. */
          },
        );
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [api, name, customer?.id]);
  const submit = form.handleSubmit(async (values) => {
    setServerError(undefined);
    try {
      const { data } = await api.request<{ data: Customer }>({
        path: customer ? `customers/${customer.id}` : 'customers',
        method: customer ? 'PATCH' : 'POST',
        json: {
          ...values,
          grade: values.grade === 'none' ? null : values.grade,
          industry: values.industry || null,
          size: values.size || null,
          source: values.source || null,
          notes: values.notes || null,
          ...(customer ? { version: customer.version } : {}),
        },
      });
      form.reset(values);
      onStateChange({ dirty: false, pending: false });
      toaster.show({
        type: 'success',
        title: t(customer ? 'customers.saved' : 'customers.created', {
          name: data.companyName,
        }),
      });
      onSaved(data);
    } catch (error) {
      const fields = invalidFields(error).filter(
        (field): field is keyof z.infer<typeof schema> =>
          [
            'companyName',
            'industry',
            'size',
            'source',
            'ownerId',
            'status',
            'grade',
            'notes',
          ].includes(field),
      );
      if (
        error instanceof ApiClientError &&
        error.reason === 'INVALID_OWNER' &&
        !fields.includes('ownerId')
      )
        fields.push('ownerId');
      if (fields.length) {
        for (const [index, field] of fields.entries())
          form.setError(
            field,
            {
              type: 'server',
              message: t(
                field === 'ownerId'
                  ? 'customers.errors.owner'
                  : 'customers.errors.invalidValue',
              ),
            },
            { shouldFocus: index === 0 },
          );
        window.setTimeout(() => form.setFocus(fields[0]), 0);
      } else setServerError(error);
      if (error instanceof ApiClientError && error.status === 404) onMissing();
    }
  });
  const terminal =
    serverError instanceof ApiClientError &&
    [403, 404, 409].includes(serverError.status);
  const disabled = isSubmitting || terminal;
  const textFields = ['companyName', 'industry', 'size', 'source'] as const;
  return (
    <form
      noValidate
      onSubmit={(e) => {
        if (!terminal) void submit(e);
      }}
      className='flex flex-col gap-6'
    >
      {serverError ? (
        serverError instanceof ApiClientError && serverError.status === 409 ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {t('customers.errors.conflict')}{' '}
              <Button variant='outline' type='button' onClick={onLoadLatest}>
                {t('customers.loadLatest')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <ErrorFeedback error={serverError} />
        )
      ) : null}
      {duplicate?.name === name && duplicate.exists ? (
        <Alert role='status'>
          <AlertDescription>{t('customers.duplicate')}</AlertDescription>
        </Alert>
      ) : null}
      {owners.error ? (
        <ErrorFeedback error={owners.error} retry={owners.reload} />
      ) : null}
      <FieldSet>
        <FieldLegend>{t('customers.basic')}</FieldLegend>
        <FieldGroup>
          {textFields.map((key) => (
            <Controller
              key={key}
              control={form.control}
              name={key}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`customer-${key}`}>
                    {t(`customers.fields.${key}`)}
                    {key === 'companyName' ? (
                      <span aria-hidden='true'>*</span>
                    ) : null}
                  </FieldLabel>
                  <Input
                    {...field}
                    id={`customer-${key}`}
                    disabled={disabled}
                    aria-invalid={fieldState.invalid}
                    aria-required={key === 'companyName'}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          ))}
        </FieldGroup>
      </FieldSet>
      <FieldSet>
        <FieldLegend>{t('customers.classification')}</FieldLegend>
        <FieldGroup>
          <Controller
            control={form.control}
            name='ownerId'
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor='customer-owner'>
                  {t('customers.fields.ownerId')}{' '}
                  <span aria-hidden='true'>*</span>
                </FieldLabel>
                <OptionSelect
                  id='customer-owner'
                  inputRef={field.ref}
                  label={t('customers.fields.ownerId')}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  required
                  invalid={fieldState.invalid}
                  disabled={disabled || !owners.data}
                  options={(owners.data ?? []).map((o) => ({
                    value: o.id,
                    label: o.name,
                  }))}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name='status'
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor='customer-status'>
                  {t('customers.fields.status')}{' '}
                  <span aria-hidden='true'>*</span>
                </FieldLabel>
                <OptionSelect
                  id='customer-status'
                  inputRef={field.ref}
                  label={t('customers.fields.status')}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  required
                  invalid={fieldState.invalid}
                  disabled={disabled}
                  options={(['potential', 'active', 'lost'] as const).map(
                    (s) => ({ value: s, label: t(`customers.statuses.${s}`) }),
                  )}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name='grade'
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor='customer-grade'>
                  {t('customers.fields.grade')}
                </FieldLabel>
                <OptionSelect
                  id='customer-grade'
                  inputRef={field.ref}
                  label={t('customers.fields.grade')}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={fieldState.invalid}
                  disabled={disabled}
                  options={[
                    { value: 'none', label: t('customers.none') },
                    ...['A', 'B', 'C'].map((v) => ({ value: v, label: v })),
                  ]}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </FieldGroup>
      </FieldSet>
      <FieldGroup>
        <Controller
          control={form.control}
          name='notes'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor='customer-notes'>
                {t('customers.fields.notes')}
              </FieldLabel>
              <Textarea
                {...field}
                id='customer-notes'
                disabled={disabled}
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
      <div className='flex flex-wrap justify-end gap-2'>
        <Button
          variant='outline'
          type='button'
          disabled={isSubmitting}
          onClick={onCancel}
        >
          {t('actions.cancel')}
        </Button>
        <Button
          type='submit'
          disabled={
            disabled ||
            !owners.data ||
            (serverError instanceof ApiClientError &&
              [403, 404, 409].includes(serverError.status))
          }
        >
          {isSubmitting ? <Spinner data-icon='inline-start' /> : null}
          {isSubmitting
            ? t('customers.saving')
            : customer
              ? t('actions.save')
              : t('customers.create')}
        </Button>
      </div>
    </form>
  );
}
