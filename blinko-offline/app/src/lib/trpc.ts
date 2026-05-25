import { createTRPCClient, httpBatchLink, httpLink, splitLink, httpBatchStreamLink, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from '../../../server/routerTrpc/_app';
import superjson from 'superjson';
import { getBlinkoEndpoint, isLocalMode, isLocalHttpUnavailable, setLocalHttpUnavailable } from './blinkoEndpoint';
import { RootStore } from '@/store';
import { UserStore } from '@/store/user';
const headers = () => {
  const userStore = RootStore.Get(UserStore);
  const token = userStore.token;
  const baseHeaders: Record<string, string> = {};

  if (token) {
    baseHeaders['Authorization'] = `Bearer ${token}`;
  }

  return baseHeaders;
};

const localInvokeLink: TRPCLink<AppRouter> = () => {
  return ({ op }) => {
    return observable((observer) => {
      (async () => {
        try {
          const data = await invokeLocal(op.path, op.input);
          observer.next({
            context: {},
            result: { type: 'data', data }
          });
          observer.complete();
        } catch (error) {
          observer.error(error as Error);
        }
      })();
      return () => {};
    });
  };
};

const invokeLocal = async (path: string, input: unknown) => {
  const { invoke } = await import('@tauri-apps/api/core');
  if (path === 'task.resetMyData') {
    // This is a destructive operation. In command-only mode we don't currently have a safe implementation,
    // so fail loudly instead of returning `{ ok: true }`.
    throw new Error('Reset is not supported in local command-only mode.');
  }
  if (path === 'notes.list') {
    return await invoke('notes_list', { input });
  }
  if (path === 'notes.detail') {
    const id = (input as any)?.id ?? 0;
    return await invoke('note_get', { id });
  }
  if (path === 'notes.upsert') {
    return await invoke('note_upsert', { input });
  }
  if (path === 'notes.deleteMany' || path === 'notes.trashMany') {
    const ids = (input as any)?.ids ?? [];
    for (const id of ids) {
      await invoke('note_delete', { id });
    }
    return { ok: true };
  }
  if (path === 'analytics.dailyNoteCount') {
    return await invoke('analytics_daily_note_count');
  }
  if (path === 'analytics.monthlyStats') {
    return await invoke('analytics_monthly_stats', { input });
  }

  // Plugin APIs (command-only mode): treat as empty to avoid breaking boot flows that iterate arrays.
  if (path === 'plugin.getInstalledPlugins') return [];
  if (path === 'plugin.getAllPlugins') return [];
  if (path === 'plugin.getPluginCssContents') return [];

  // Fallbacks for unsupported commands in command-only mode
  if (path.endsWith('list') || path.endsWith('List')) return [];
  if (path.endsWith('detail') || path.endsWith('Detail')) return null;
  return { ok: true };
};


const getTransformer = () => {
  return isLocalMode() ? undefined : superjson;
};

const getLinks = (useStream = false) => {
  try {
    if (isLocalMode() && isLocalHttpUnavailable()) {
      return localInvokeLink;
    }

    if (isLocalMode()) {
      const localUrl = getBlinkoEndpoint('/api/trpc');
      if (!localUrl.startsWith('http://') && !localUrl.startsWith('https://')) {
        setLocalHttpUnavailable(true);
        return localInvokeLink;
      }
      return httpLink({
        url: localUrl,
        transformer: getTransformer(),
        headers,
        fetch(url, options) {
          return fetch(url, {
            ...options,
            signal: AbortSignal.timeout(5 * 60 * 1000)
          });
        }
      });
    }

    if (useStream) {
      return httpBatchStreamLink({
        url: getBlinkoEndpoint('/api/trpc'),
        transformer: getTransformer(),
        headers,
        // Increase timeout for large file uploads (5 minutes)
        fetch(url, options) {
          return fetch(url, {
            ...options,
            signal: AbortSignal.timeout(5 * 60 * 1000) // 5 minutes
          });
        }
      });
    }

    return splitLink({
      condition(op) {
        return op.context.skipBatch === true;
      },
      true: httpLink({
        url: getBlinkoEndpoint('/api/trpc'),
        transformer: getTransformer(),
        headers,
        // Increase timeout for large file uploads (5 minutes)
        fetch(url, options) {
          return fetch(url, {
            ...options,
            signal: AbortSignal.timeout(5 * 60 * 1000) // 5 minutes
          });
        }
      }),
      // when condition is false, use batching
      false: httpBatchLink({
        url: getBlinkoEndpoint('/api/trpc'),
        transformer: getTransformer(),
        headers,
        // Increase timeout for large file uploads (5 minutes)
        fetch(url, options) {
          return fetch(url, {
            ...options,
            signal: AbortSignal.timeout(5 * 60 * 1000) // 5 minutes
          });
        }
      }),
    });
  } catch (error) {
    console.error(error, 'trpc get links error');
    return splitLink({
      condition(op) {
        return op.context.skipBatch === true;
      },
      true: httpLink({
        url: ('/api/trpc'),
        transformer: getTransformer(),
        headers,
        // Increase timeout for large file uploads (5 minutes)
        fetch(url, options) {
          return fetch(url, {
            ...options,
            signal: AbortSignal.timeout(5 * 60 * 1000) // 5 minutes
          });
        }
      }),
      // when condition is false, use batching
      false: httpBatchLink({
        url: ('/api/trpc'),
        transformer: getTransformer(),
        headers,
        // Increase timeout for large file uploads (5 minutes)
        fetch(url, options) {
          return fetch(url, {
            ...options,
            signal: AbortSignal.timeout(5 * 60 * 1000) // 5 minutes
          });
        }
      }),
    });;
  }
};

//@ts-ignore
export let api = createTRPCClient<AppRouter>({
  links: [getLinks(false)],
});

//@ts-ignore
export let streamApi = createTRPCClient<AppRouter>({
  links: [getLinks(true)],
});

/**
 * refresh api
 * when need refresh auth status (login/logout)
 */
export const reinitializeTrpcApi = () => {
  //@ts-ignore
  api = createTRPCClient<AppRouter>({
    links: [getLinks(false)],
  });

  //@ts-ignore
  streamApi = createTRPCClient<AppRouter>({
    links: [getLinks(true)],
  });

  return { api, streamApi };
};
