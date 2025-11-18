import { serializeError } from "serialize-error";

function hasEsiSurrogateControl(
  response: Response,
  headerName: string,
): boolean {
  const surrogateControl = response.headers.get(headerName);
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

function matchesUrlPattern(url: string, patterns: URLPattern[]): boolean {
  try {
    const urlObj = new URL(url);
    return patterns.some((pattern) => pattern.test(urlObj));
  } catch {
    return false;
  }
}

function shouldDelegateToSurrogate(
  request: Request,
  surrogateDelegation: boolean | string[],
): boolean {
  if (!surrogateDelegation) {
    return false;
  }

  const surrogateCapability = request.headers.get("Surrogate-Capability");
  if (!surrogateCapability || !/ESI\/1\.0/i.test(surrogateCapability)) {
    return false;
  }

  if (Array.isArray(surrogateDelegation)) {
    const cfConnectingIp = request.headers.get("CF-Connecting-IP");
    return (
      cfConnectingIp !== null && surrogateDelegation.includes(cfConnectingIp)
    );
  }

  return true;
}

function shimEsiTags(html: string, tag: string): string {
  return html
    .replace(/<esi:include\s+([^>]*?)\s*\/>/gi, `<${tag} $1></${tag}>`)
    .replace(/<esi:include\s+([^>]*?)>/gi, `<${tag} $1>`)
    .replace(/<\/esi:include>/gi, `</${tag}>`);
}

function log(value: unknown, level: "error" | "warn" | "info" | "log" = "log") {
  console[level]("[esi-html-rewriter]", serializeError(value));
}

export interface EsiOptions {
  contentTypes: string[];
  maxDepth: number;
  allowedUrlPatterns: URLPattern[];
  shim: boolean;
  onError?: (error: unknown, element: Element) => void;
  /**
   * Surrogate Delegation - if true and the request has valid Surrogate-Capability headers
   * indicating a downstream surrogate can handle ESI, the response will be returned without processing.
   * If an array of strings, each string is treated as an IP address. Delegation only occurs if
   * the connecting IP (CF-Connecting-IP) matches one of the provided IPs.
   */
  surrogateDelegation?: boolean | string[];
  /**
   * Name of the header that the library will check for Surrogate-Control.
   * We allow customization as Cloudflare prioritizes Surrogate-Control over Cache-Control.
   * @default "Surrogate-Control"
   */
  surrogateControlHeader?: string;
}

export class Esi {
  public readonly contentTypes: string[];
  public readonly maxDepth: number;
  public readonly allowedUrlPatterns: URLPattern[];
  public readonly shim: boolean;
  private readonly onError: (error: unknown, element: Element) => void;
  private readonly surrogateDelegation: boolean | string[];
  private readonly surrogateControlHeader: string;

  constructor(options: Partial<EsiOptions> = {}) {
    this.maxDepth = options.maxDepth ?? 3;
    this.contentTypes = options.contentTypes ?? ["text/html"];
    this.allowedUrlPatterns = options.allowedUrlPatterns ?? [new URLPattern()];
    this.shim = options.shim ?? false;
    this.surrogateDelegation = options.surrogateDelegation ?? false;
    this.surrogateControlHeader =
      options.surrogateControlHeader ?? "Surrogate-Control";
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
    const parentRequest = context[context.length - 1];

    if (!parentRequest) {
      throw new Error("Request context is required");
    }

    // Subtract the initial request
    const nestedDepth = context.length - 1;

    if (nestedDepth > this.maxDepth) {
      return response;
    }

    if (
      !response.body ||
      shouldDelegateToSurrogate(parentRequest, this.surrogateDelegation) ||
      !hasEsiSurrogateControl(response, this.surrogateControlHeader) ||
      !hasAllowedContentType(response, this.contentTypes)
    ) {
      return response;
    }

    let responseToParse = response.clone();
    let selector = "esi:include";

    if (this.shim) {
      selector = "esi-include";

      // Ensure we have a consumable body for parsing
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

      const esiUrl = new URL(src, parentRequest.url);
      const isSameOrigin = new URL(parentRequest.url).origin === esiUrl.origin;
      const headers = isSameOrigin ? parentRequest.headers : new Headers();
      const esiRequest = new Request(esiUrl, {
        headers,
      });

      if (!matchesUrlPattern(esiRequest.url, this.allowedUrlPatterns)) {
        throw new Error("ESI include URL not allowed", {
          cause: { url: esiRequest.url },
        });
      }

      const esiResponse = await this.fetch(esiRequest, context);

      if (!esiResponse.ok) {
        throw new Error("ESI include response not OK", {
          cause: {
            request: {
              url: esiRequest.url,
              headers: esiRequest.headers.entries(),
            },
            response: {
              status: esiResponse.status,
              headers: esiResponse.headers.entries(),
            },
          },
        });
      }

      element.replace(await esiResponse.text(), { html: true });
    };

    const transformedResponse = new HTMLRewriter()
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

    // Modify headers after ESI processing
    // Set Cache-Control to prevent caching of dynamically assembled content
    transformedResponse.headers.set("Cache-Control", "private, max-age=0");

    // Remove cache validation headers that are no longer valid after ESI processing
    transformedResponse.headers.delete("Last-Modified");
    transformedResponse.headers.delete("ETag");
    transformedResponse.headers.delete("content-length");

    // Remove Surrogate-Control header as it's an internal processing directive
    transformedResponse.headers.delete(this.surrogateControlHeader);

    return transformedResponse;
  }

  async fetch(request: Request, context: Request[] = []): Promise<Response> {
    const requestWithCapability = addSurrogateCapability(request);
    const response = await fetch(requestWithCapability);
    return this.parseResponse(response, [...context, request]);
  }
}
