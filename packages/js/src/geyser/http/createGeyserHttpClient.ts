import { ofetch } from "ofetch";
import { DarkflowGeyserApiError } from "../errors.js";

export type CreateGeyserHttpClientConfig = {
  apiKey: string;
  baseUrl: string;
  debug?: boolean;
  timeout?: number;
  retry?: number;
};

export const createGeyserHttpClient = (config: CreateGeyserHttpClientConfig) => {
  const debug = config.debug ?? false;
  return ofetch.create({
    baseURL: config.baseUrl,
    timeout: config.timeout ?? 30_000,
    retry: config.retry ?? 2,
    onRequest({ request, options }) {
      const headers = new Headers(options.headers as HeadersInit | undefined);
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${config.apiKey}`);
      }
      if (!headers.has("Accept")) {
        headers.set("Accept", "application/json");
      }
      options.headers = headers;
      if (debug) {
        const requestUrl =
          typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
        // eslint-disable-next-line no-console
        console.log("[@darkflow/js/geyser]", options.method ?? "GET", requestUrl);
      }
    },
    onResponse({ response, request, options }) {
      if (debug) {
        const requestUrl =
          typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
        // eslint-disable-next-line no-console
        console.log("[@darkflow/js/geyser]", response.status, options.method ?? "GET", requestUrl);
      }
    },
    onResponseError({ response }) {
      const raw = (response as { _data?: unknown })._data;
      const data =
        raw && typeof raw === "object"
          ? (raw as { message?: string; code?: string; [key: string]: unknown })
          : undefined;
      throw new DarkflowGeyserApiError(
        typeof data?.message === "string" ? data.message : response.statusText || "Request failed",
        response.status,
        typeof data?.code === "string" ? data.code : "HTTP_ERROR",
        data as Record<string, unknown> | undefined
      );
    }
  });
};
