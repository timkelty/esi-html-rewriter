import type { ErrorHandler, EsiParserOptions } from "./types";

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

function addSurrogateCapability(
  request: Request,
  capabilityToken: string = "ESI/1.0",
): Request {
  const clonedRequest = request.clone();
  const headers = new Headers(clonedRequest.headers);

  const existing = headers.get("Surrogate-Capability");
  const capability = `cloudflare-workers="${capabilityToken}"`;

  if (existing) {
    headers.set("Surrogate-Capability", `${existing}, ${capability}`);
  } else {
    headers.set("Surrogate-Capability", capability);
  }

  return new Request(clonedRequest, { headers });
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

function shimEsiTags(html: string, tag: string): string {
  return html
    .replace(/<esi:include\s+([^>]*?)\s*\/>/gi, `<${tag} $1></${tag}>`)
    .replace(/<esi:include\s+([^>]*?)>/gi, `<${tag} $1>`)
    .replace(/<\/esi:include>/gi, `</${tag}>`);
}

export class Esi {
  public readonly fetchHandler: typeof fetch;
  public readonly errorHandler: ErrorHandler;
  public readonly contentTypes: string[];
  public readonly maxDepth: number;
  public readonly allowedUrlPatterns: (URLPattern | string)[] | undefined;
  public readonly shim: boolean;

  constructor(options: EsiParserOptions = {}) {
    this.fetchHandler =
      options.fetchHandler ||
      ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
    this.errorHandler = options.errorHandler || (() => "");
    this.maxDepth = options.maxDepth ?? 3;
    this.contentTypes = options.contentTypes || ["text/html"];
    this.allowedUrlPatterns = options.allowedUrlPatterns;
    this.shim = options.shim ?? false;
  }

  async parseResponse(
    response: Response,
    request: string | Request,
    currentDepth: number = 0,
  ): Promise<Response> {
    if (!response.body) {
      return response;
    }

    if (!hasEsiSurrogateControl(response)) {
      return response;
    }

    if (!hasAllowedContentType(response, this.contentTypes)) {
      return response;
    }

    return this.parseHtml(response.body, request, currentDepth);
  }

  async parseHtml(
    html: string | ReadableStream,
    request: string | Request,
    currentDepth: number = 0,
  ): Promise<Response> {
    const baseUrl = typeof request === "string" ? request : request.url;
    const parentRequest = typeof request === "string" ? undefined : request;

    const headers = {
      "Content-Type": "text/html; charset=utf-8",
    };

    let parsedHtml: string | ReadableStream = html;
    let selector = "esi:include";

    if (this.shim) {
      selector = "esi-include";
      parsedHtml =
        typeof html === "string"
          ? shimEsiTags(html, selector)
          : shimEsiTags(await new Response(html, { headers }).text(), selector);
    }

    const htmlStream =
      typeof parsedHtml === "string"
        ? new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(parsedHtml));
              controller.close();
            },
          })
        : parsedHtml;

    const response = new Response(htmlStream, {
      headers,
    });

    const elementHandler = async (element: Element): Promise<void> => {
      const src = element.getAttribute("src");

      if (!src) {
        element.remove();
        return;
      }

      if (currentDepth >= this.maxDepth) {
        const error = new Error(`ESI recursion depth exceeded`, {
          cause: {
            url: src,
            maxDepth: this.maxDepth,
          },
        });
        const url = new URL(src, baseUrl).toString();
        console.error(error);
        const includeRequest = parentRequest
          ? new Request(url, { headers: parentRequest.headers })
          : new Request(url);
        const replacement = this.errorHandler(error, includeRequest);
        if (replacement) {
          element.replace(replacement, { html: true });
        } else {
          element.remove();
        }
        return;
      }

      try {
        const url = new URL(src, baseUrl).toString();

        if (this.allowedUrlPatterns && this.allowedUrlPatterns.length > 0) {
          if (!matchesUrlPattern(url, this.allowedUrlPatterns)) {
            const error = new Error("ESI include URL not allowed", {
              cause: { url },
            });
            console.error(error);
            const includeRequest = parentRequest
              ? new Request(url, { headers: parentRequest.headers })
              : new Request(url);
            const replacement = this.errorHandler(error, includeRequest);
            if (replacement) {
              element.replace(replacement, { html: true });
            } else {
              element.remove();
            }
            return;
          }
        }

        const includeRequest = parentRequest
          ? new Request(url, { headers: parentRequest.headers })
          : new Request(url);
        const includeResponse = await this.fetch(
          includeRequest,
          currentDepth + 1,
        );

        if (!includeResponse.ok) {
          const error = new Error("ESI fetch failed", {
            cause: {
              url,
              status: includeResponse.status,
              statusText: includeResponse.statusText,
            },
          });
          console.error(error);
          const replacement = this.errorHandler(
            error,
            includeRequest,
            includeResponse,
          );
          if (replacement) {
            element.replace(replacement, { html: true });
          } else {
            element.remove();
          }
          return;
        }

        const content = await includeResponse.text();
        element.replace(content, { html: true });
      } catch (error) {
        const url = new URL(src, baseUrl).toString();
        const includeRequest = parentRequest
          ? new Request(url, { headers: parentRequest.headers })
          : new Request(url);
        const err =
          error instanceof Error
            ? error
            : new Error("ESI processing error", {
                cause: { originalError: error, url },
              });
        console.error(err);
        const replacement = this.errorHandler(err, includeRequest);
        if (replacement) {
          element.replace(replacement, { html: true });
        } else {
          element.remove();
        }
      }
    };

    return new HTMLRewriter()
      .on(selector, {
        element: elementHandler,
      })
      .transform(response);
  }

  async fetch(request: Request, currentDepth: number = 0): Promise<Response> {
    const requestWithCapability = addSurrogateCapability(request);
    const response = await this.fetchHandler(requestWithCapability);
    return this.parseResponse(response, request, currentDepth);
  }
}

