export type DarkflowErrorDetails = Record<string, unknown> | undefined;

export class DarkflowError extends Error {
  public readonly code: string;
  public readonly details: DarkflowErrorDetails;

  public constructor(message: string, code: string, details?: DarkflowErrorDetails) {
    super(message);
    this.name = "DarkflowError";
    this.code = code;
    this.details = details;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DarkflowError);
    }
  }
}

export class DarkflowAuthError extends DarkflowError {
  public readonly status: number;

  public constructor(message: string, status: number, code: string, details?: DarkflowErrorDetails) {
    super(message, code, details);
    this.name = "DarkflowAuthError";
    this.status = status;
  }

  public isInsufficientCredits(): boolean {
    return this.status === 402 || this.code === "INSUFFICIENT_CREDITS";
  }

  public isForbidden(): boolean {
    return this.status === 403 || this.code === "FORBIDDEN";
  }

  public isUnauthorized(): boolean {
    return this.status === 401 || this.code === "UNAUTHORIZED";
  }
}

export class DarkflowParseError extends DarkflowError {
  public constructor(message: string, details?: DarkflowErrorDetails) {
    super(message, "PARSE_ERROR", details);
    this.name = "DarkflowParseError";
  }
}

export class DarkflowConnectionError extends DarkflowError {
  public constructor(message: string, code: string, details?: DarkflowErrorDetails) {
    super(message, code, details);
    this.name = "DarkflowConnectionError";
  }
}

export class DarkflowHttpError extends DarkflowError {
  public readonly status: number;

  public constructor(message: string, status: number, code: string, details?: DarkflowErrorDetails) {
    super(message, code, details);
    this.name = "DarkflowHttpError";
    this.status = status;
  }

  public isRateLimit(): boolean {
    return this.status === 429 || this.code === "RATE_LIMIT";
  }

  public isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export const isDarkflowError = (e: unknown): e is DarkflowError => e instanceof DarkflowError;

export const isDarkflowAuthError = (e: unknown): e is DarkflowAuthError => e instanceof DarkflowAuthError;

export const isDarkflowHttpError = (e: unknown): e is DarkflowHttpError => e instanceof DarkflowHttpError;

export const isDarkflowParseError = (e: unknown): e is DarkflowParseError => e instanceof DarkflowParseError;

export const isDarkflowConnectionError = (e: unknown): e is DarkflowConnectionError =>
  e instanceof DarkflowConnectionError;
