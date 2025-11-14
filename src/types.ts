export type ErrorHandler = (
  error: Error,
  request: Request,
  response?: Response,
) => string;

export interface EsiParserOptions {
  fetchHandler?: typeof fetch;
  errorHandler?: ErrorHandler;
  contentTypes?: string[];
  maxDepth?: number;
  allowedUrlPatterns?: (URLPattern | string)[];
  shim?: boolean;
}
