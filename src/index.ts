import { serializeError, isErrorLike } from "serialize-error";

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

function log(
  value: unknown,
  level: "error" | "warn" | "info" | "log" = "log") {
  console[level]('[esi-html-rewriter]', serializeError(value));
}

export interface EsiOptions {
  contentTypes: string[];
  maxDepth: number;
  allowedUrlPatterns?: (URLPattern | string)[];
  shim: boolean;
  onError?: (error: unknown, element: Element) => void;
}

export class Esi {
  public readonly contentTypes: string[];
  public readonly maxDepth: number;
  public readonly allowedUrlPatterns: (URLPattern | string)[] | undefined;
  public readonly shim: boolean;
  private readonly onError: (error: unknown, element: Element) => void;

  constructor(options: Partial<EsiOptions> = {}) {
    this.maxDepth = options.maxDepth ?? 3;
    this.contentTypes = options.contentTypes ?? ["text/html"];
    this.allowedUrlPatterns = options.allowedUrlPatterns;
    this.shim = options.shim ?? false;
    this.onError =
      options.onError ??
      ((error: unknown, element: Element) => {
        element.remove();
        log(error);
      });
  }

  async parseResponse(
    response: Response,
    context: Request[] = [],
  ): Promise<Response> {
    
    const parentRequest = context.at(-1);

    if (!parentRequest) {
      throw new Error("Request context is required");
    }
    
    if (context.length >= this.maxDepth) {      
      return response;
    }

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

      // Ensure we have a consumuable body for parsing
      responseToParse = new Response(
        shimEsiTags(await responseToParse.text(), selector),
        response,
      );
    }

    const onEsiElement = async (element: Element) => {
      const src = element.getAttribute("src");

      if (!src) {
        throw new Error("ESI include src attribute is required");
      }
  
      // TODO: test what happens with no parentRequest and a root relative URL
      const baseUrl = new URL(src, parentRequest?.url);
      const esiRequest = new Request(baseUrl);
  
      if (context.length >= this.maxDepth) {
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
        ...context,
        parentRequest,
      ]);
  
      if (!esiResponse.ok) {
        throw new Error("ESI fetch failed", {
          cause: {
            request: esiRequest,
            response: esiResponse,
          },
        });
      }
  
      element.replace(await esiResponse.text(), { html: true });  
    }

    return new HTMLRewriter()
      .on(selector, {
        element: async (element: Element) => {
          try {
            await onEsiElement(element);
          } catch (error) {
            this.onError(error, element);
          }
        },
      })
      .transform(responseToParse);
  }

  async fetch(
    request: Request,
    context: Request[] = [],
  ): Promise<Response> {
    const response = await fetch(request);
    return this.parseResponse(response, [...context, request]);
  }
}
