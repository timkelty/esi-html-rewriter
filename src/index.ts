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

function logError(error: unknown, context?: Record<string, unknown>): void {
  // Extract all error properties including non-enumerable ones
  const errorObj = error instanceof Error ? error : new Error(String(error));
  const errorWithCode = errorObj as Error & { code?: number | string };
  
  // Build error info object with all properties
  const errorInfo: Record<string, unknown> = {
    message: errorObj.message,
    name: errorObj.name,
    stack: errorObj.stack,
  };
  
  // Add error code if it exists (e.g., Cloudflare Workers error 1042)
  if (errorWithCode.code !== undefined) {
    errorInfo.code = errorWithCode.code;
  }
  
  // Add all own properties from the error object
  for (const key of Object.getOwnPropertyNames(errorObj)) {
    if (!(key in errorInfo)) {
      try {
        errorInfo[key] = (errorObj as unknown as Record<string, unknown>)[key];
      } catch {
        // Skip properties that can't be accessed
      }
    }
  }
  
  // Add cause if it exists
  if (errorObj.cause !== undefined) {
    errorInfo.cause = errorObj.cause;
  }
  
  // Add any additional context
  if (context) {
    errorInfo.context = context;
  }
  
  // Log with all information
  console.error("ESI Error:", errorInfo);
}

export interface EsiOptions {
  contentTypes?: string[];
  maxDepth?: number;
  allowedUrlPatterns?: (URLPattern | string)[];
  shim?: boolean;
}

export class Esi {
  public readonly contentTypes: string[];
  public readonly maxDepth: number;
  public readonly allowedUrlPatterns: (URLPattern | string)[] | undefined;
  public readonly shim: boolean;

  constructor(options: EsiOptions = {}) {
    this.maxDepth = options.maxDepth ?? 3;
    this.contentTypes = options.contentTypes || ["text/html"];
    this.allowedUrlPatterns = options.allowedUrlPatterns;
    this.shim = options.shim ?? false;
  }

  async parseResponse(
    response: Response,
    request: Request,
    depth: number = 0,
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
            await this.handleEsiInclude(element, request, depth);
          } catch (error) {
            logError(error, { url: element.getAttribute("src") || "unknown" });
          }
        },
      })
      .transform(responseToParse);
  }

  private async handleEsiInclude(
    element: Element,
    request: Request,
    depth: number,
  ): Promise<void> {
    const src = element.getAttribute("src");

    if (!src) {
      throw new Error("ESI include src attribute is required");
    }

    if (depth >= this.maxDepth) {
      throw new Error(`ESI recursion depth exceeded`, {
        cause: {
          url: new URL(src, request.url).toString(),
          maxDepth: this.maxDepth,
        },
      });
    }

    const esiRequest = new Request(
      new URL(src, request.url),
      {...request},
    );

    if (this.allowedUrlPatterns && this.allowedUrlPatterns.length > 0) {
      if (!matchesUrlPattern(esiRequest.url, this.allowedUrlPatterns)) {
        throw new Error("ESI include URL not allowed", {
          cause: { url: esiRequest.url },
        });
      }
    }
    
    const esiResponse = await this.fetch(
      esiRequest,
      depth + 1,
    );

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
    depth: number = 0,
  ): Promise<Response> {
    const requestWithCapability = addSurrogateCapability(request);
    const response = await fetch(requestWithCapability);
    return this.parseResponse(response, request, depth);
  }
}

