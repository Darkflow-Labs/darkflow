export type DarkflowGeyserErrorDetails = Record<string, unknown> | undefined;

export class DarkflowGeyserError extends Error {
  public readonly code: string;
  public readonly details: DarkflowGeyserErrorDetails;

  public constructor(message: string, code: string, details?: DarkflowGeyserErrorDetails) {
    super(message);
    this.name = "DarkflowGeyserError";
    this.code = code;
    this.details = details;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DarkflowGeyserError);
    }
  }
}

export class DarkflowGeyserApiError extends DarkflowGeyserError {
  public readonly status: number;

  public constructor(
    message: string,
    status: number,
    code: string,
    details?: DarkflowGeyserErrorDetails
  ) {
    super(message, code, details);
    this.name = "DarkflowGeyserApiError";
    this.status = status;
  }

  public isAuthError(): boolean {
    return this.status === 401 || this.status === 403 || this.code === "UNAUTHORIZED";
  }

  public isRateLimitError(): boolean {
    return this.status === 429 || this.code === "RATE_LIMITED";
  }

  public isValidationError(): boolean {
    return this.status === 422 || this.code === "VALIDATION_ERROR";
  }

  public isTransientError(): boolean {
    return this.status >= 500 || this.status === 429;
  }
}

export class DarkflowGeyserConnectionError extends DarkflowGeyserError {
  public constructor(message: string, code: string, details?: DarkflowGeyserErrorDetails) {
    super(message, code, details);
    this.name = "DarkflowGeyserConnectionError";
  }
}

export const isDarkflowGeyserError = (value: unknown): value is DarkflowGeyserError =>
  value instanceof DarkflowGeyserError;
