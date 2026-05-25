// src/server/routers/helper/axios.ts
import axios, { AxiosInstance, AxiosRequestConfig, AxiosProxyConfig } from 'axios';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { ProxyAgent } from 'undici';
import { getGlobalConfig } from '@server/routerTrpc/config';
import { Context } from '@server/context';

// Extended interface for http.AgentOptions and https.AgentOptions to include auth property
interface ExtendedAgentOptions extends http.AgentOptions, https.AgentOptions {
  auth?: string;
}

/**
 * Creates a fetch function that uses the configured HTTP proxy
 * @param options
 * @returns A fetch function that works with the proxy settings
 */
export async function fetchWithProxy(): Promise<typeof fetch> {
  const proxyUrl = await getProxyUrl();
  if (!proxyUrl) {
    return fetch;
  }

  try {
    // Create undici proxy agent
    const proxyAgent = new ProxyAgent(proxyUrl);
    // Return a fetch function that uses the proxy with proper type casting
    const proxiedFetch = ((url: RequestInfo | URL, init?: RequestInit) => {
      const fetchOptions: RequestInit & { dispatcher?: any } = {
        ...init,
        dispatcher: proxyAgent,
        // proxy: proxyUrl //bun env use this
      };
      return fetch(url, fetchOptions).catch((error) => {
        // Handle fetch errors gracefully
        console.error(`[Server] Proxied fetch error:`, error);
        const safeError = error instanceof Error ? error : new Error(String(error));
        return Promise.reject(safeError);
      });
    }) as typeof fetch;

    return proxiedFetch;
  } catch (error) {
    console.error(`[Server] Failed to create proxy agent:`, error);
    // Fallback to regular fetch
    return fetch;
  }
}

/**
 * create axios instance with proxy
 * @param options
 * @returns
 */
export async function createAxiosWithProxy(options?: { ctx?: Context; useAdmin?: boolean; baseConfig?: AxiosRequestConfig }): Promise<AxiosInstance> {
  const { ctx, useAdmin = true, baseConfig = {} } = options || {};

  const globalConfig = await getGlobalConfig({ ctx, useAdmin });

  // create axios instance with better defaults for proxied connections
  const axiosInstance = axios.create({
    ...baseConfig,
    timeout: baseConfig.timeout || 30000,
    validateStatus: function (status) {
      return true;
    }
  });

  axiosInstance.interceptors.request.use(
    (config) => {
      return config;
    },
    (error) => {
      console.error('[Server] Axios request error:', error);
      const safeError = error instanceof Error ? error : new Error(String(error));
      return Promise.reject(safeError);
    }
  );

  // if enabled http proxy, set proxy
  if (globalConfig.isUseHttpProxy && globalConfig.httpProxyHost) {
    let proxyHost = globalConfig.httpProxyHost;
    const proxyPort = globalConfig.httpProxyPort || 8080;

    // Detect protocol based on the URL prefix
    let protocol = 'http'; // Default protocol
    if (proxyHost.includes('://')) {
      try {
        const url = new URL(proxyHost);
        protocol = url.protocol.replace(':', ''); // Remove the colon from protocol (e.g., "https:" → "https")
        proxyHost = url.hostname;
      } catch (e) {
        // If URL parsing fails, try extracting protocol with regex
        const protocolMatch = proxyHost.match(/^(https?):\/\//);
        if (protocolMatch && protocolMatch[1]) {
          protocol = protocolMatch[1];
        }
        proxyHost = proxyHost.replace(/^(https?:\/\/)/, '');
      }
    }

    console.log(`[Server] Config HTTP proxy: ${proxyHost}:${proxyPort} (${protocol})`);

    // build proxy options with enhanced settings
    const proxyOptions: ExtendedAgentOptions = {
      host: proxyHost,
      port: proxyPort,
    };

    console.log(`[Server] Proxy options: ${JSON.stringify(proxyOptions)}`);

    // if provided username and password, add to proxy options
    if (globalConfig.httpProxyUsername && globalConfig.httpProxyPassword) {
      proxyOptions.auth = `${globalConfig.httpProxyUsername}:${globalConfig.httpProxyPassword}`;
    }

    // also set proxy url
    axiosInstance.defaults.proxy = {
      host: proxyHost,
      port: proxyPort,
      protocol: protocol,
      auth:
        globalConfig.httpProxyUsername && globalConfig.httpProxyPassword
          ? {
            username: globalConfig.httpProxyUsername,
            password: globalConfig.httpProxyPassword,
          }
          : undefined,
    } as AxiosProxyConfig;
  }

  axiosInstance.interceptors.response.use(
    (response) => {
      return response;
    },
    (error) => {
      try {
        let errorMessage = 'Unknown error';
        let statusCode = 500;
        let errorCode = '';
        let errorDetails = {};

        // Create a proper Error object first
        let safeError: Error;
        if (error instanceof Error) {
          safeError = error;
        } else {
          safeError = new Error(String(error));
        }

        if (error.response) {
          statusCode = error.response.status;
          console.error(`[Server] Proxy response status: ${statusCode}`);
        }

        if (error.code) {
          errorCode = error.code;
          errorMessage = `${errorCode}`;

          if (errorCode === 'ECONNRESET') {
            errorMessage += ': The connection was reset. This may be due to a proxy configuration issue or network problem.';
          } else if (errorCode === 'ECONNREFUSED') {
            errorMessage += ': The connection was refused. Please check if the proxy server is running and accessible.';
          } else if (errorCode === 'ENOTFOUND') {
            errorMessage += ': Host not found. Please check your proxy host settings.';
          } else if (errorCode === 'ETIMEDOUT') {
            errorMessage += ': Connection timed out. The proxy server took too long to respond.';
          }
        }

        errorDetails = {
          message: errorMessage,
          status: statusCode,
          code: errorCode || 'UNKNOWN_ERROR',
          url: error.config?.url || 'unknown'
        };

        const proxyInfo = {
          message: errorMessage,
          host: globalConfig.httpProxyHost,
          port: globalConfig.httpProxyPort,
        };

        // Create a new error with enhanced properties instead of using Object.assign
        const enhancedError = new Error(errorMessage);
        enhancedError.name = safeError.name;
        enhancedError.stack = safeError.stack;
        (enhancedError as any).status = statusCode;
        (enhancedError as any).code = errorCode;
        (enhancedError as any).details = errorDetails;
        (enhancedError as any).proxyInfo = proxyInfo;
        (enhancedError as any).response = error.response;
        (enhancedError as any).config = error.config;

        return Promise.reject(enhancedError);
      } catch (handlerError) {
        console.error('[Server] Error in error handler:', handlerError);
        const fallbackError = new Error('Failed to process network request');
        return Promise.reject(fallbackError);
      }
    }
  );

  console.log(`[Server] Axios instance created with proxy: ${globalConfig.isUseHttpProxy ? 'enabled' : 'disabled'}`);
  return axiosInstance;
}

export async function getWithProxy(
  url: string,
  options?: {
    ctx?: Context;
    useAdmin?: boolean;
    config?: AxiosRequestConfig;
  },
) {
  try {
    const { ctx, useAdmin, config = {} } = options || {};
    const axiosInstance = await createAxiosWithProxy({ ctx, useAdmin });
    return await axiosInstance.get(url, config);
  } catch (error) {
    console.error(`[Server] getWithProxy error for URL ${url}:`, error);
    const safeError = error instanceof Error ? error : new Error(String(error));
    return {
      error: true,
      data: null,
      status: (error as any)?.response?.status || 500,
      statusText: (error as any)?.response?.statusText || 'Error',
      message: safeError.message || 'Unknown error',
      proxyInfo: (error as any)?.proxyInfo || {},
      url
    };
  }
}

export async function postWithProxy(
  url: string,
  data?: any,
  options?: {
    ctx?: Context;
    useAdmin?: boolean;
    config?: AxiosRequestConfig;
  },
) {
  try {
    const { ctx, useAdmin, config = {} } = options || {};
    const axiosInstance = await createAxiosWithProxy({ ctx, useAdmin });
    return await axiosInstance.post(url, data, config);
  } catch (error) {
    console.error(`[Server] postWithProxy error for URL ${url}:`, error);
    const safeError = error instanceof Error ? error : new Error(String(error));
    return {
      error: true,
      data: null,
      status: (error as any)?.response?.status || 500,
      statusText: (error as any)?.response?.statusText || 'Error',
      message: safeError.message || 'Unknown error',
      proxyInfo: (error as any)?.proxyInfo || {},
      url
    };
  }
}

export async function getProxyUrl(options?: { ctx?: Context; useAdmin?: boolean }): Promise<string | null> {
  const { ctx, useAdmin = true } = options || {};

  const globalConfig = await getGlobalConfig({ ctx, useAdmin });

  if (!globalConfig.isUseHttpProxy || !globalConfig.httpProxyHost) {
    return null;
  }

  let proxyHost = globalConfig.httpProxyHost;
  const proxyPort = globalConfig.httpProxyPort || 8080;

  // Detect protocol based on the URL prefix
  let protocol = 'http'; // Default protocol
  if (proxyHost.includes('://')) {
    try {
      const url = new URL(proxyHost);
      protocol = url.protocol.replace(':', ''); // Remove the colon from protocol (e.g., "https:" → "https")
      proxyHost = url.hostname;
    } catch (e) {
      // If URL parsing fails, try extracting protocol with regex
      const protocolMatch = proxyHost.match(/^(https?):\/\//);
      if (protocolMatch && protocolMatch[1]) {
        protocol = protocolMatch[1];
      }
      proxyHost = proxyHost.replace(/^(https?:\/\/)/, '');
    }
  }

  if (globalConfig.httpProxyUsername && globalConfig.httpProxyPassword) {
    return `${protocol}://${globalConfig.httpProxyUsername}:${globalConfig.httpProxyPassword}@${proxyHost}:${proxyPort}`;
  }

  return `${protocol}://${proxyHost}:${proxyPort}`;
}

export async function getHttpCacheKey(options?: { ctx?: Context; useAdmin?: boolean }): Promise<string> {
  const { ctx, useAdmin = true } = options || {};
  const globalConfig = await getGlobalConfig({ ctx, useAdmin });
  return `${globalConfig.isUseHttpProxy}-${globalConfig.httpProxyHost}-${globalConfig.httpProxyPort}-${globalConfig.httpProxyUsername}-${globalConfig.httpProxyPassword}`;
}