import { useApiClient } from '@nocobase/app-client';
import { useEffect, useReducer, useState } from 'react';
import type { ListResult, Owner } from './types.js';

/** Walks every page, never silently drops owners beyond the endpoint's page limit. */
export function useOwners() {
  const api = useApiClient();
  const [revision, reload] = useReducer((n: number) => n + 1, 0);
  const [result, setResult] = useState<{ data?: Owner[]; error?: unknown }>();
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const owners: Owner[] = [];
      let page = 1;
      while (!controller.signal.aborted) {
        const response = await api.request<ListResult<Owner>>({
          path: 'customerOwners',
          query: { page, pageSize: 100 },
          signal: controller.signal,
        });
        owners.push(...response.data);
        if (!response.data.length || owners.length >= response.meta.total)
          break;
        page += 1;
      }
      if (!controller.signal.aborted) setResult({ data: owners });
    }
    void load().catch((error: unknown) => {
      if (!controller.signal.aborted) setResult({ error });
    });
    return () => controller.abort();
  }, [api, revision]);
  return { ...result, reload };
}
