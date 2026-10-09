import { useState, useCallback } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export function useConfirmation() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<{
    title: string;
    description: string;
    resolve: (allow: boolean) => void;
  }>();
  const request = useCallback(
    (title: string, description: string) =>
      new Promise<boolean>((resolve) => {
        setCurrent({ title, description, resolve });
        setOpen(true);
      }),
    [],
  );
  const respond = (allow: boolean) => {
    current?.resolve(allow);
    setOpen(false);
  };
  const dialog = (
    <AlertDialog
      open={open}
      onOpenChange={(open) => {
        if (!open) respond(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{current?.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {current?.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant='outline' onClick={() => respond(false)}>
            {t('actions.cancel')}
          </Button>
          <Button variant='destructive' onClick={() => respond(true)}>
            {t('crmTeams.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { request, dialog };
}
export type Confirm = ReturnType<typeof useConfirmation>['request'];
