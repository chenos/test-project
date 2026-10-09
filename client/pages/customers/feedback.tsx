import { ApiClientError } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircle, Building2 } from 'lucide-react';
import { Alert, AlertDescription, AlertAction } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
  EmptyContent,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import type { ReactNode } from 'react';

export function ErrorFeedback({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  const { t } = useTranslation();
  const { refresh } = useAuthentication();
  const status = error instanceof ApiClientError ? error.status : 0;
  return (
    <Alert variant='destructive'>
      <AlertCircle />
      <AlertDescription>
        {t(
          status === 401
            ? 'customers.errors.session'
            : status === 403
              ? 'customers.errors.forbidden'
              : status === 404
                ? 'customers.errors.notFound'
                : 'customers.errors.failed',
        )}
      </AlertDescription>
      <AlertAction>
        {status === 401 ? (
          <Button variant='outline' size='sm' onClick={() => void refresh()}>
            {t('customers.signIn')}
          </Button>
        ) : status !== 403 && status !== 404 && retry ? (
          <Button variant='outline' size='sm' onClick={retry}>
            {t('status.retry')}
          </Button>
        ) : null}
      </AlertAction>
    </Alert>
  );
}
export function LoadingRows() {
  const { t } = useTranslation();
  return (
    <div
      role='status'
      aria-label={t('status.loading')}
      className='flex flex-col gap-4'
    >
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className='h-10 w-full' />
      ))}
    </div>
  );
}
export function EmptyRecords({
  contact = false,
  filtered = false,
  action,
}: {
  contact?: boolean;
  filtered?: boolean;
  action?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Empty className='min-h-48 border border-dashed'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <Building2 />
        </EmptyMedia>
        <EmptyTitle>
          {t(
            filtered
              ? 'customers.noResults'
              : contact
                ? 'contacts.empty'
                : 'customers.empty',
          )}
        </EmptyTitle>
        <EmptyDescription>
          {t(
            filtered
              ? 'customers.noResultsDescription'
              : contact
                ? 'contacts.emptyDescription'
                : 'customers.emptyDescription',
          )}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>{action}</EmptyContent>
    </Empty>
  );
}

export function DetailSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      role='status'
      aria-label={t('status.loading')}
      className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3'
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className='contents'>
          <Skeleton className='h-5 w-20' />
          <Skeleton className='h-5 w-full' />
        </div>
      ))}
    </div>
  );
}
