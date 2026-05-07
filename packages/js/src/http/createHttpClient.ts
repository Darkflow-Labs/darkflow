import { ofetch } from "ofetch";
import { DarkflowHttpError } from "../errors.js";

export type CreateHttpClientConfig = {
  apiKey: string;
  baseUrl?: string;
  debug?: boolean;
  timeout?: number;
  retry?: number;
};

export const createHttpClient = (config: CreateHttpClientConfig) => {
  const baseURL = config.baseUrl ?? "https://api.darkflow.io";
  const debug = config.debug ?? false;

  return ofetch.create({
    baseURL,
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
      if (!headers.has("Content-Type") && options.method && options.method !== "GET" && options.method !== "HEAD") {
        headers.set("Content-Type", "application/json");
      }
      options.headers = headers;
      if (debug) {
        const url =
          typeof request === "string"
            ? request
            : request instanceof URL
              ? request.href
              : request.url;
        // eslint-disable-next-line no-console
        console.log("[@darkflow/js]", options.method ?? "GET", url);
      }
    },
    onResponse({ response, request, options }) {
      if (debug) {
        const url =
          typeof request === "string"
            ? request
            : request instanceof URL
              ? request.href
              : request.url;
        // eslint-disable-next-line no-console
        console.log("[@darkflow/js]", response.status, options.method ?? "GET", url);
      }
    },
    onResponseError({ response }) {
      const raw = (response as { _data?: unknown })._data;
      const data =
        raw && typeof raw === "object"
          ? (raw as { message?: string; code?: string; [key: string]: unknown })
          : undefined;
      throw new DarkflowHttpError(
        typeof data?.message === "string" ? data.message : response.statusText || "Request failed",
        response.status,
        typeof data?.code === "string" ? data.code : "HTTP_ERROR",
        data as Record<string, unknown> | undefined
      );
    }
  });
};
