import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

/** Restore focus after the covering route has unmounted and released `inert`. */
export function useReturnFocus() {
  const { pathname } = useLocation();
  const previousPathRef = useRef(pathname);
  useEffect(() => {
    const previous = previousPathRef.current;
    previousPathRef.current = pathname;
    if (!previous.startsWith(`${pathname}/`)) return;
    Array.from(
      document.querySelectorAll<HTMLElement>('[data-customer-return-focus]'),
    )
      .find((element) => !element.closest('[inert]'))
      ?.focus();
  }, [pathname]);
}
