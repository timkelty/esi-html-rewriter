/**
 * ESI (Edge Side Includes) Parser for Cloudflare Workers
 * 
 * Currently supports:
 * - <esi:include src="..."> tags
 * 
 * Features:
 * - Uses HTMLRewriter for efficient streaming parsing
 * - Configurable error handling via onerror option
 * - ESI/1.0 compliant: Only processes responses with Surrogate-Control header
 * - Requires html_rewriter_treats_esi_include_as_void_tag compatibility flag
 */

/**
 * Checks if a Response has the Surrogate-Control header indicating ESI processing is enabled.
 * 
 * @param response - The Response to check
 * @returns true if the response has Surrogate-Control with content="ESI/1.0"
 */
function hasEsiSurrogateControl(response: Response): boolean {
  const surrogateControl = response.headers.get('Surrogate-Control');
  if (!surrogateControl) {
    return false;
  }
  
  // Check if the header contains content="ESI/1.0"
  // The header can be a comma-separated list of directives
  return /content\s*=\s*"ESI\/1\.0"/i.test(surrogateControl);
}

/**
 * Checks if a Response's Content-Type matches one of the allowed content types.
 * 
 * @param response - The Response to check
 * @param allowedContentTypes - Array of allowed content types (e.g., ['text/html', 'text/xhtml'])
 * @returns true if the response's Content-Type matches one of the allowed types
 */
function hasAllowedContentType(response: Response, allowedContentTypes: string[]): boolean {
  const contentType = response.headers.get('Content-Type');
  if (!contentType) {
    return false;
  }
  
  // Extract the MIME type (before semicolon, if present)
  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  
  // Check if it matches any of the allowed content types (case-insensitive)
  return allowedContentTypes.some(allowed => 
    allowed.toLowerCase() === mimeType
  );
}

/**
 * Adds the Surrogate-Capability header to a Request to advertise ESI processing capability.
 * 
 * @param request - The Request to modify
 * @param capabilityToken - Optional capability token (default: "ESI/1.0")
 * @returns A new Request with the Surrogate-Capability header added
 */
export function addSurrogateCapability(
  request: Request,
  capabilityToken: string = 'ESI/1.0'
): Request {
  const headers = new Headers(request.headers);
  
  // Get existing Surrogate-Capability header or create new one
  const existing = headers.get('Surrogate-Capability');
  const capability = `cloudflare-workers="${capabilityToken}"`;
  
  if (existing) {
    // Append to existing header (comma-separated)
    headers.set('Surrogate-Capability', `${existing}, ${capability}`);
  } else {
    headers.set('Surrogate-Capability', capability);
  }
  
  // Create a new request with the updated headers
  return new Request(request, { headers });
}

export type OnErrorHandler = (
  error: Error,
  request: Request,
  response?: Response
) => string;

export interface EsiParserOptions {
  /**
   * Base URL for resolving relative URLs in src attributes
   */
  baseUrl?: string;
  
  /**
   * Custom fetch function (useful for testing or custom request handling)
   */
  fetch?: typeof fetch;
  
  /**
   * Controls what happens when an ESI fetch returns an error response or fails.
   * 
   * Called with the error, Request object, and optional response. Return a string
   * to replace the element with. Return an empty string to remove the element.
   * 
   * Default: Returns an empty string (removes the element).
   */
  onerror?: OnErrorHandler;
  
  /**
   * Array of content types that should be processed for ESI includes.
   * Only responses with Content-Type matching one of these types will be processed.
   * 
   * Default: ['text/html']
   */
  contentTypes?: string[];
  
  /**
   * Maximum recursion depth for nested ESI includes.
   * Prevents infinite loops when ESI includes include other ESI includes.
   * 
   * Default: 3
   */
  maxDepth?: number;
  
  /**
   * Array of URLPattern objects or pattern strings to restrict which URLs can be included.
   * Only URLs matching at least one pattern will be fetched.
   * If not provided, all URLs are allowed.
   * 
   * Example: [new URLPattern({ pathname: '/api/*' }), 'https://example.com/*']
   */
  allowedUrlPatterns?: (URLPattern | string)[];
}

/**
 * Checks if a URL matches any of the allowed URL patterns.
 * 
 * @param url - The URL to check
 * @param patterns - Array of URLPattern objects or pattern strings
 * @returns true if the URL matches at least one pattern
 */
function matchesUrlPattern(url: string, patterns: (URLPattern | string)[]): boolean {
  try {
    const urlObj = new URL(url);
    
    return patterns.some(pattern => {
      if (typeof pattern === 'string') {
        // Convert string pattern to URLPattern
        try {
          const urlPattern = new URLPattern(pattern);
          return urlPattern.test(urlObj);
        } catch {
          // If pattern string is invalid, try as a simple prefix match
          return url.startsWith(pattern.replace('*', ''));
        }
      } else {
        // URLPattern object
        return pattern.test(urlObj);
      }
    });
  } catch {
    // Invalid URL
    return false;
  }
}

/**
 * Handler for <esi:include> elements
 * 
 * Note: HTMLRewriter supports async element handlers. The handler will
 * be awaited before the stream continues processing.
 */
class EsiIncludeHandler {
  constructor(
    private baseUrl: string | undefined,
    private customFetch: typeof fetch,
    private onerror: OnErrorHandler,
    private maxDepth: number,
    private currentDepth: number,
    private allowedUrlPatterns: (URLPattern | string)[] | undefined,
    private contentTypes: string[],
    private options: EsiParserOptions
  ) {}

  async element(element: Element): Promise<void> {
    const src = element.getAttribute('src');
    
    if (!src) {
      // No src attribute, remove the element
      element.remove();
      return;
    }

    // Check recursion depth
    if (this.currentDepth >= this.maxDepth) {
      const error = new Error(`ESI recursion depth exceeded (max: ${this.maxDepth})`);
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
      // Resolve URL
      const url = this.baseUrl ? new URL(src, this.baseUrl).toString() : src;
      
      // Check URL pattern if patterns are specified
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
      
      // Create Request object
      const request = new Request(url);
      
      // Fetch the included content
      const response = await this.customFetch(request);
      
      if (!response.ok) {
        // Handle error response
        const error = new Error(`ESI fetch failed: ${response.status} ${response.statusText}`);
        const replacement = this.handleError(error, request, response);
        if (replacement) {
          element.replace(replacement, { html: true });
        } else {
          element.remove();
        }
        return;
      }

      // Check if the response should be recursively processed for ESI
      const shouldRecurse = hasEsiSurrogateControl(response) && 
                           hasAllowedContentType(response, this.contentTypes);
      
      let content: string;
      if (shouldRecurse) {
        // Recursively process ESI includes in the fetched content
        const processedResponse = parseEsi(response.body!, {
          ...this.options,
          baseUrl: url,
        }, this.currentDepth + 1);
        content = await processedResponse.text();
      } else {
        // Get the content as-is
        content = await response.text();
      }
      
      // Replace the element with the fetched content
      element.replace(content, { html: true });
    } catch (error) {
      // Handle fetch error
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
    response?: Response
  ): string {
    return this.onerror(error, request, response);
  }
}

/**
 * Parses HTML content and processes ESI includes
 * 
 * @param html - The HTML content to parse (string or ReadableStream)
 * @param options - Parser options
 * @param currentDepth - Current recursion depth (internal use)
 * @returns A Response with the processed HTML
 */
export function parseEsi(
  html: string | ReadableStream,
  options: EsiParserOptions = {},
  currentDepth: number = 0
): Response {
  const { 
    baseUrl, 
    fetch: customFetch = fetch, 
    onerror = () => '',
    maxDepth = 3,
    allowedUrlPatterns,
    contentTypes = ['text/html']
  } = options;
  
  // Convert string to ReadableStream if needed
  const htmlStream = typeof html === 'string' 
    ? new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(html));
          controller.close();
        },
      })
    : html;

  // Create a Response from the stream
  const response = new Response(htmlStream, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });

  // Use HTMLRewriter to transform the response
  const rewriter = new HTMLRewriter();
  const handler = new EsiIncludeHandler(
    baseUrl, 
    customFetch, 
    onerror, 
    maxDepth, 
    currentDepth,
    allowedUrlPatterns,
    contentTypes,
    options
  );
  
  return rewriter.on('esi:include', handler).transform(response);
}

/**
 * Processes a Response containing HTML with ESI includes.
 * 
 * Only processes the response if:
 * 1. It contains a Surrogate-Control header with content="ESI/1.0" (ESI/1.0 specification)
 * 2. Its Content-Type matches one of the allowed content types (default: 'text/html')
 * 
 * @param response - The Response to process
 * @param options - Parser options
 * @returns A new Response with processed HTML, or the original response if ESI processing is not enabled
 */
export function processEsiResponse(
  response: Response,
  options: EsiParserOptions = {}
): Response {
  if (!response.body) {
    return response;
  }

  // Check if the response has Surrogate-Control header indicating ESI processing
  if (!hasEsiSurrogateControl(response)) {
    return response;
  }

  // Check if the response has an allowed content type
  const allowedContentTypes = options.contentTypes || ['text/html'];
  if (!hasAllowedContentType(response, allowedContentTypes)) {
    return response;
  }

  // Extract base URL from response if not provided
  const baseUrl = options.baseUrl || response.url;
  
  return parseEsi(response.body, { ...options, baseUrl });
}

