import { useTranslation } from '@nocobase/i18n/client';
import { Button } from '@/components/ui/button';

export function Pager({
  page,
  total,
  pageSize = 20,
  onChange,
  disabled,
}: {
  page: number;
  total: number;
  pageSize?: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className='flex flex-wrap items-center justify-end gap-2'>
      <p className='text-sm text-muted-foreground'>
        {t('customers.pagination', {
          page,
          pages,
          total: new Intl.NumberFormat(i18n.language).format(total),
        })}
      </p>
      <Button
        variant='outline'
        size='sm'
        disabled={disabled || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        {t('dataTable.previousPage')}
      </Button>
      <Button
        variant='outline'
        size='sm'
        disabled={disabled || page >= pages}
        onClick={() => onChange(page + 1)}
      >
        {t('dataTable.nextPage')}
      </Button>
    </div>
  );
}
