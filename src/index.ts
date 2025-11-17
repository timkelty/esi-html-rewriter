import { serializeError } from "serialize-error";

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

function logError(error: unknown) {
  console.error("[esi-html-rewriter]", serializeError(error));
}

export interface EsiOptions {
  contentTypes?: string[];
  maxDepth?: number;
  allowedUrlPatterns?: (URLPattern | string)[];
  shim?: boolean;
  onError?: (error: unknown, element: Element) => void;
  fetch?: (request: Request, requestContext: Request[]) => Promise<Response>;
}

export class Esi {
  public readonly contentTypes: string[];
  public readonly maxDepth: number;
  public readonly allowedUrlPatterns: (URLPattern | string)[] | undefined;
  public readonly shim: boolean;
  private readonly onError: (error: unknown, element: Element) => void;
  private readonly fetchHandler: (
    request: Request,
    requestContext: Request[],
  ) => Promise<Response>;

  constructor(options: EsiOptions = {}) {
    this.maxDepth = options.maxDepth ?? 3;
    this.contentTypes = options.contentTypes || ["text/html"];
    this.allowedUrlPatterns = options.allowedUrlPatterns;
    this.shim = options.shim ?? false;
    this.onError =
      options.onError ??
      ((error: unknown, element: Element) => {
        element.remove();
        logError(error);
      });
    this.fetchHandler =
      options.fetch ??
      ((request: Request, requestContext: Request[]) => fetch(request));
  }

  async parseResponse(
    response: Response,
    request: Request,
    requestContext: Request[] = [],
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

    let responseToParse = response.clone();
    let selector = "esi:include";

    if (this.shim) {
      selector = "esi-include";
      responseToParse = new Response(
        shimEsiTags(await response.text(), selector),
        response,
      );
    }

    return new HTMLRewriter()
      .on(selector, {
        element: async (element: Element) => {
          try {
            await this.handleEsiInclude(element, request, requestContext);
          } catch (error) {
            this.onError(error, element);
          }
        },
      })
      .transform(responseToParse);
  }

  private async handleEsiInclude(
    element: Element,
    request: Request,
    requestContext: Request[],
  ): Promise<void> {
    const src = element.getAttribute("src");

    if (!src) {
      throw new Error("ESI include src attribute is required");
    }

    const esiRequest = new Request(new URL(src, request.url), { ...request });

    if (requestContext.length >= this.maxDepth) {
      throw new Error(`ESI recursion depth exceeded`, {
        cause: {
          url: esiRequest.url,
          maxDepth: this.maxDepth,
        },
      });
    }

    if (this.allowedUrlPatterns && this.allowedUrlPatterns.length > 0) {
      if (!matchesUrlPattern(esiRequest.url, this.allowedUrlPatterns)) {
        throw new Error("ESI include URL not allowed", {
          cause: { url: esiRequest.url },
        });
      }
    }

    const esiResponse = await this.fetch(esiRequest, [
      ...requestContext,
      request,
    ]);

    if (!esiResponse.ok) {
      throw new Error("ESI fetch failed", {
        cause: {
          url: esiRequest.url,
          status: esiResponse.status,
          statusText: esiResponse.statusText,
        },
      });
    }

    element.replace(await esiResponse.text(), { html: true });
  }

  async fetch(
    request: Request,
    requestContext: Request[] = [],
  ): Promise<Response> {
    const requestWithCapability = addSurrogateCapability(request);
    const response = await this.fetchHandler(
      requestWithCapability,
      requestContext,
    );
    return this.parseResponse(response, request, requestContext);
  }
}
