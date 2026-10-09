import { useApiClient } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useAuthorizationRevision } from '@nocobase/app-plugin-authorization/client';
import { useCallback, useEffect, useReducer, useState } from 'react';

/** Retains data during reload, aborts obsolete requests and never puts a late result into another record. */
export function useResource<T>(
  path: string,
  query: Record<string, string | number | undefined> = {},
) {
  const api = useApiClient();
  const { session } = useAuthentication();
  const authorizationRevision = useAuthorizationRevision();
  const identity = `${session?.user.id ?? ''}:${authorizationRevision}`;
  const [revision, reload] = useReducer((n: number) => n + 1, 0);
  const key = JSON.stringify([path, query, revision, identity]);
  const [result, setResult] = useState<{
    key: string;
    path: string;
    identity: string;
    data?: T;
    error?: unknown;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    const [requestPath, requestQuery, , requestIdentity] = JSON.parse(key) as [
      string,
      Record<string, string | number | undefined>,
      number,
      string,
    ];
    api
      .request<T>({
        path: requestPath,
        query: requestQuery,
        signal: controller.signal,
      })
      .then(
        (data) => {
          if (!controller.signal.aborted)
            setResult({
              key,
              path: requestPath,
              identity: requestIdentity,
              data,
            });
        },
        (error: unknown) => {
          if (!controller.signal.aborted)
            setResult({
              key,
              path: requestPath,
              identity: requestIdentity,
              error,
            });
        },
      );
    return () => controller.abort();
  }, [api, key]);
  const setData = useCallback(
    (data: T) => setResult({ key, path, identity, data }),
    [key, path, identity],
  );
  return {
    data:
      result?.path === path && result.identity === identity
        ? result.data
        : undefined,
    error: result?.key === key ? result.error : undefined,
    loading: result?.key !== key,
    reload,
    setData,
  };
}
