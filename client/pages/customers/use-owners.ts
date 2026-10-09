import { useApiClient } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useAuthorizationRevision } from '@nocobase/app-plugin-authorization/client';
import { useCallback, useEffect, useReducer, useState } from 'react';
import type { ListResult, Owner } from './types.js';

/** Walks every page, never silently drops owners beyond the endpoint's page limit. */
export function useOwners(path = 'customerOwners', enabled = true) {
  return useDirectory<Owner>(path, enabled);
}
export function useDirectory<T>(path: string, enabled = true) {
  const api = useApiClient();
  const { session } = useAuthentication();
  const authorizationRevision = useAuthorizationRevision();
  const identity = `${session?.user.id ?? ''}:${authorizationRevision}:${path}`;
  const [revision, reload] = useReducer((n: number) => n + 1, 0);
  const [result, setResult] = useState<{
    identity: string;
    data?: T[];
    error?: unknown;
  }>();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    async function load() {
      const owners: T[] = [];
      let page = 1;
      while (!controller.signal.aborted) {
        const response = await api.request<ListResult<T>>({
          path,
          query: { page, pageSize: 100 },
          signal: controller.signal,
        });
        owners.push(...response.data);
        if (!response.data.length || owners.length >= response.meta.total)
          break;
        page += 1;
      }
      if (!controller.signal.aborted) setResult({ identity, data: owners });
    }
    void load().catch((error: unknown) => {
      if (!controller.signal.aborted) setResult({ identity, error });
    });
    return () => controller.abort();
  }, [api, revision, identity, path, enabled]);
  const setData = useCallback(
    (data: T[]) => setResult({ identity, data }),
    [identity],
  );
  return {
    data: enabled
      ? result?.identity === identity
        ? result.data
        : undefined
      : [],
    error: enabled && result?.identity === identity ? result.error : undefined,
    reload,
    setData,
  };
}
