import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Link, useLocation } from 'react-router';

export function TextCell({ value, to }: { value: string | null; to?: string }) {
  const location = useLocation();
  const text = value || '—';
  return (
    <Tooltip
      onOpenChange={(open, details) => {
        const trigger = details.trigger;
        if (open && trigger && trigger.scrollWidth <= trigger.clientWidth)
          details.cancel();
      }}
    >
      <TooltipTrigger
        render={
          to ? (
            <Link
              to={{ pathname: to, search: location.search }}
              className='block max-w-xs truncate underline-offset-4 hover:underline'
            />
          ) : (
            <span className='block max-w-xs truncate' />
          )
        }
      >
        {text}
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
