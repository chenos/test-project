import { useApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useReducer, useState } from 'react';

/** Retains data during reload, aborts obsolete requests and never puts a late result into another record. */
export function useResource<T>(
  path: string,
  query: Record<string, string | number | undefined> = {},
) {
  const api = useApiClient();
  const [revision, reload] = useReducer((n: number) => n + 1, 0);
  const key = JSON.stringify([path, query, revision]);
  const [result, setResult] = useState<{
    key: string;
    path: string;
    data?: T;
    error?: unknown;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    const [requestPath, requestQuery] = JSON.parse(key) as [
      string,
      Record<string, string | number | undefined>,
      number,
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
            setResult({ key, path: requestPath, data });
        },
        (error: unknown) => {
          if (!controller.signal.aborted)
            setResult({ key, path: requestPath, error });
        },
      );
    return () => controller.abort();
  }, [api, key]);
  const setData = useCallback(
    (data: T) => setResult({ key, path, data }),
    [key, path],
  );
  return {
    data: result?.path === path ? result.data : undefined,
    error: result?.key === key ? result.error : undefined,
    loading: result?.key !== key,
    reload,
    setData,
  };
}
