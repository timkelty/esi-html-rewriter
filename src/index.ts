function hasEsiSurrogateControl(response: Response): boolean {
  const surrogateControl = response.headers.get("Surrogate-Control");
  if (!surrogateControl) {
    return false;
  }

  return /content\s*=\s*"ESI\/1\.0"/i.test(surrogateControl);
}

function hasAllowedContentType(
  response: Response,
  allowedContentTypes: string[],
): boolean {
  const contentType = response.headers.get("Content-Type");
  if (!contentType) {
    return false;
  }

  const mimeType = contentType.split(";")[0].trim().toLowerCase();

  return allowedContentTypes.some(
    (allowed) => allowed.toLowerCase() === mimeType,
  );
}

export function addSurrogateCapability(
  request: Request,
  capabilityToken: string = "ESI/1.0",
): Request {
  const headers = new Headers(request.headers);

  const existing = headers.get("Surrogate-Capability");
  const capability = `cloudflare-workers="${capabilityToken}"`;

  if (existing) {
    headers.set("Surrogate-Capability", `${existing}, ${capability}`);
  } else {
    headers.set("Surrogate-Capability", capability);
  }

  return new Request(request, { headers });
}

export type OnErrorHandler = (
  error: Error,
  request: Request,
  response?: Response,
) => string;

export interface EsiParserOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  onError?: OnErrorHandler;
  contentTypes?: string[];
  maxDepth?: number;
  allowedUrlPatterns?: (URLPattern | string)[];
}

function matchesUrlPattern(
  url: string,
  patterns: (URLPattern | string)[],
): boolean {
  try {
    const urlObj = new URL(url);

    return patterns.some((pattern) => {
      if (typeof pattern === "string") {
        try {
          const urlPattern = new URLPattern(pattern);
          return urlPattern.test(urlObj);
        } catch {
          return url.startsWith(pattern.replace("*", ""));
        }
      } else {
        return pattern.test(urlObj);
      }
    });
  } catch {
    return false;
  }
}

class EsiIncludeHandler {
  constructor(
    private baseUrl: string | undefined,
    private customFetch: typeof fetch,
    private onError: OnErrorHandler,
    private maxDepth: number,
    private currentDepth: number,
    private allowedUrlPatterns: (URLPattern | string)[] | undefined,
    private contentTypes: string[],
    private options: EsiParserOptions,
  ) {}

  async element(element: Element): Promise<void> {
    const src = element.getAttribute("src");

    if (!src) {
      element.remove();
      return;
    }

    if (this.currentDepth >= this.maxDepth) {
      const error = new Error(
        `ESI recursion depth exceeded (max: ${this.maxDepth})`,
      );
      const url = this.baseUrl ? new URL(src, this.baseUrl).toString() : src;
      const request = new Request(url);
      const replacement = this.handleError(error, request);
      if (replacement) {
        element.replace(replacement, { html: true });
      } else {
        element.remove();
      }
      return;
    }

    try {
      const url = this.baseUrl ? new URL(src, this.baseUrl).toString() : src;

      if (this.allowedUrlPatterns && this.allowedUrlPatterns.length > 0) {
        if (!matchesUrlPattern(url, this.allowedUrlPatterns)) {
          const error = new Error(`ESI include URL not allowed: ${url}`);
          const request = new Request(url);
          const replacement = this.handleError(error, request);
          if (replacement) {
            element.replace(replacement, { html: true });
          } else {
            element.remove();
          }
          return;
        }
      }

      const request = new Request(url);
      const response = await this.customFetch(request);

      if (!response.ok) {
        const error = new Error(
          `ESI fetch failed: ${response.status} ${response.statusText}`,
        );
        const replacement = this.handleError(error, request, response);
        if (replacement) {
          element.replace(replacement, { html: true });
        } else {
          element.remove();
        }
        return;
      }

      const shouldRecurse =
        hasEsiSurrogateControl(response) &&
        hasAllowedContentType(response, this.contentTypes);

      let content: string;
      if (shouldRecurse) {
        const processedResponse = parseEsi(
          response.body!,
          {
            ...this.options,
            baseUrl: url,
          },
          this.currentDepth + 1,
        );
        content = await processedResponse.text();
      } else {
        content = await response.text();
      }

      element.replace(content, { html: true });
    } catch (error) {
      const url = this.baseUrl ? new URL(src, this.baseUrl).toString() : src;
      const request = new Request(url);
      const err = error instanceof Error ? error : new Error(String(error));
      const replacement = this.handleError(err, request);
      if (replacement) {
        element.replace(replacement, { html: true });
      } else {
        element.remove();
      }
    }
  }

  private handleError(
    error: Error,
    request: Request,
    response?: Response,
  ): string {
    return this.onError(error, request, response);
  }
}

export function parseEsi(
  html: string | ReadableStream,
  options: EsiParserOptions = {},
  currentDepth: number = 0,
): Response {
  const {
    baseUrl,
    fetch: customFetch = fetch,
    onError = () => "",
    maxDepth = 3,
    allowedUrlPatterns,
    contentTypes = ["text/html"],
  } = options;

  const htmlStream =
    typeof html === "string"
      ? new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(html));
            controller.close();
          },
        })
      : html;

  const response = new Response(htmlStream, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });

  const rewriter = new HTMLRewriter();
  const handler = new EsiIncludeHandler(
    baseUrl,
    customFetch,
    onError,
    maxDepth,
    currentDepth,
    allowedUrlPatterns,
    contentTypes,
    options,
  );

  return rewriter.on("esi:include", handler).transform(response);
}

export function processEsiResponse(
  response: Response,
  options: EsiParserOptions = {},
): Response {
  if (!response.body) {
    return response;
  }

  if (!hasEsiSurrogateControl(response)) {
    return response;
  }

  const allowedContentTypes = options.contentTypes || ["text/html"];
  if (!hasAllowedContentType(response, allowedContentTypes)) {
    return response;
  }

  const baseUrl = options.baseUrl || response.url;

  return parseEsi(response.body, { ...options, baseUrl });
}
