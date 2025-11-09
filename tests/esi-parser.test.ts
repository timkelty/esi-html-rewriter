import { describe, it, expect, beforeEach } from "vitest";
import { parseEsi, processEsiResponse, addSurrogateCapability } from "../src/esi-parser";

describe("ESI Parser", () => {
  describe("parseEsi", () => {
    it("should replace esi:include with fetched content", async () => {
      const html = '<html><body><esi:include src="https://example.com/content" /></body></html>';
      
      const mockFetch = async (url: string | Request) => {
        if (url === "https://example.com/content") {
          return new Response("<p>Included content</p>");
        }
        return new Response("Not found", { status: 404 });
      };

      const result = parseEsi(html, { fetch: mockFetch });
      const text = await result.text();

      expect(text).toContain("<p>Included content</p>");
      expect(text).not.toContain("<esi:include");
    });

    it("should handle multiple esi:include tags", async () => {
      const html = `
        <html>
          <body>
            <esi:include src="https://example.com/header" />
            <main>Main content</main>
            <esi:include src="https://example.com/footer" />
          </body>
        </html>
      `;

      const mockFetch = async (url: string | Request) => {
        if (url === "https://example.com/header") {
          return new Response("<header>Header</header>");
        }
        if (url === "https://example.com/footer") {
          return new Response("<footer>Footer</footer>");
        }
        return new Response("Not found", { status: 404 });
      };

      const result = parseEsi(html, { fetch: mockFetch });
      const text = await result.text();

      expect(text).toContain("<header>Header</header>");
      expect(text).toContain("<footer>Footer</footer>");
      expect(text).toContain("Main content");
      expect(text).not.toContain("<esi:include");
    });

    it("should resolve relative URLs using baseUrl", async () => {
      const html = '<html><body><esi:include src="/api/content" /></body></html>';
      
      const mockFetch = async (url: string | Request) => {
        if (url === "https://example.com/api/content") {
          return new Response("<div>API Content</div>");
        }
        return new Response("Not found", { status: 404 });
      };

      const result = parseEsi(html, { 
        baseUrl: "https://example.com",
        fetch: mockFetch 
      });
      const text = await result.text();

      expect(text).toContain("<div>API Content</div>");
      expect(text).not.toContain("<esi:include");
    });

    it("should remove esi:include tag when src attribute is missing", async () => {
      const html = '<html><body><esi:include /></body></html>';

      const result = parseEsi(html);
      const text = await result.text();

      expect(text).not.toContain("<esi:include");
    });

    it("should remove esi:include tag on fetch error", async () => {
      const html = '<html><body><esi:include src="https://example.com/error" /></body></html>';
      
      const mockFetch = async () => {
        throw new Error("Network error");
      };

      const result = parseEsi(html, { fetch: mockFetch });
      const text = await result.text();

      expect(text).not.toContain("<esi:include");
    });

    it("should remove esi:include tag when response is not OK", async () => {
      const html = '<html><body><esi:include src="https://example.com/404" /></body></html>';
      
      const mockFetch = async () => {
        return new Response("Not found", { status: 404 });
      };

      const result = parseEsi(html, { fetch: mockFetch });
      const text = await result.text();

      expect(text).not.toContain("<esi:include");
    });

    it("should handle ReadableStream input", async () => {
      const html = '<html><body><esi:include src="https://example.com/content" /></body></html>';
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(html));
          controller.close();
        },
      });

      const mockFetch = async (url: string | Request) => {
        if (url === "https://example.com/content") {
          return new Response("<span>Streamed content</span>");
        }
        return new Response("Not found", { status: 404 });
      };

      const result = parseEsi(stream, { fetch: mockFetch });
      const text = await result.text();

      expect(text).toContain("<span>Streamed content</span>");
      expect(text).not.toContain("<esi:include");
    });

    it("should preserve HTML structure around includes", async () => {
      const html = `
        <html>
          <head><title>Test</title></head>
          <body>
            <div class="container">
              <esi:include src="https://example.com/widget" />
            </div>
          </body>
        </html>
      `;

      const mockFetch = async (url: string | Request) => {
        if (url === "https://example.com/widget") {
          return new Response("<div class="widget">Widget</div>");
        }
        return new Response("Not found", { status: 404 });
      };

      const result = parseEsi(html, { fetch: mockFetch });
      const text = await result.text();

      expect(text).toContain("<title>Test</title>");
      expect(text).toContain('<div class="container">');
      expect(text).toContain('<div class="widget">Widget</div>');
    });

    it("should handle HTML content in included response", async () => {
      const html = '<html><body><esi:include src="https://example.com/html" /></body></html>';

      const mockFetch = async (url: string | Request) => {
        if (url === "https://example.com/html") {
          return new Response("<h1>Title</h1><p>Paragraph with <strong>bold</strong> text</p>");
        }
        return new Response("Not found", { status: 404 });
      };

      const result = parseEsi(html, { fetch: mockFetch });
      const text = await result.text();

      expect(text).toContain("<h1>Title</h1>");
      expect(text).toContain("<p>Paragraph with <strong>bold</strong> text</p>");
    });
  });

  describe("processEsiResponse", () => {
    it("should process ESI includes in a Response with Surrogate-Control header", async () => {
      const originalResponse = new Response(
        '<html><body><esi:include src="https://example.com/content" /></body></html>',
        { 
          headers: { 
            "Content-Type": "text/html",
            "Surrogate-Control": 'content="ESI/1.0"'
          },
          url: "https://example.com/page"
        }
      );

      const mockFetch = async (url: string | Request) => {
        if (url === "https://example.com/content") {
          return new Response("<p>Processed content</p>");
        }
        return new Response("Not found", { status: 404 });
      };

      const result = processEsiResponse(originalResponse, { fetch: mockFetch });
      const text = await result.text();

      expect(text).toContain("<p>Processed content</p>");
      expect(text).not.toContain("<esi:include");
    });

    it("should not process Response without Surrogate-Control header", async () => {
      const originalResponse = new Response(
        '<html><body><esi:include src="https://example.com/content" /></body></html>',
        { 
          headers: { "Content-Type": "text/html" },
          url: "https://example.com/page"
        }
      );

      const result = processEsiResponse(originalResponse);
      
      // Should return the original response unchanged
      expect(result).toBe(originalResponse);
      const text = await result.text();
      expect(text).toContain("<esi:include");
    });

    it("should process Response with Surrogate-Control header containing multiple directives", async () => {
      const originalResponse = new Response(
        '<html><body><esi:include src="https://example.com/content" /></body></html>',
        { 
          headers: { 
            "Content-Type": "text/html",
            "Surrogate-Control": 'no-store, content="ESI/1.0", max-age=3600'
          },
          url: "https://example.com/page"
        }
      );

      const mockFetch = async (url: string | Request) => {
        if (url === "https://example.com/content") {
          return new Response("<p>Processed content</p>");
        }
        return new Response("Not found", { status: 404 });
      };

      const result = processEsiResponse(originalResponse, { fetch: mockFetch });
      const text = await result.text();

      expect(text).toContain("<p>Processed content</p>");
      expect(text).not.toContain("<esi:include");
    });

    it("should not process Response with unsupported content type", async () => {
      const originalResponse = new Response(
        '<html><body><esi:include src="https://example.com/content" /></body></html>',
        { 
          headers: { 
            "Content-Type": "application/json",
            "Surrogate-Control": 'content="ESI/1.0"'
          },
          url: "https://example.com/page"
        }
      );

      const result = processEsiResponse(originalResponse);
      
      // Should return the original response unchanged
      expect(result).toBe(originalResponse);
      const text = await result.text();
      expect(text).toContain("<esi:include");
    });

    it("should process Response with text/html content type including charset", async () => {
      const originalResponse = new Response(
        '<html><body><esi:include src="https://example.com/content" /></body></html>',
        { 
          headers: { 
            "Content-Type": "text/html; charset=utf-8",
            "Surrogate-Control": 'content="ESI/1.0"'
          },
          url: "https://example.com/page"
        }
      );

      const mockFetch = async (url: string | Request) => {
        if (url === "https://example.com/content") {
          return new Response("<p>Processed content</p>");
        }
        return new Response("Not found", { status: 404 });
      };

      const result = processEsiResponse(originalResponse, { fetch: mockFetch });
      const text = await result.text();

      expect(text).toContain("<p>Processed content</p>");
      expect(text).not.toContain("<esi:include");
    });

    it("should process Response with custom content types when specified", async () => {
      const originalResponse = new Response(
        '<html><body><esi:include src="https://example.com/content" /></body></html>',
        { 
          headers: { 
            "Content-Type": "text/xhtml",
            "Surrogate-Control": 'content="ESI/1.0"'
          },
          url: "https://example.com/page"
        }
      );

      const mockFetch = async (url: string | Request) => {
        if (url === "https://example.com/content") {
          return new Response("<p>Processed content</p>");
        }
        return new Response("Not found", { status: 404 });
      };

      const result = processEsiResponse(originalResponse, { 
        fetch: mockFetch,
        contentTypes: ['text/xhtml', 'text/html']
      });
      const text = await result.text();

      expect(text).toContain("<p>Processed content</p>");
      expect(text).not.toContain("<esi:include");
    });

    it("should not process Response with content type not in custom list", async () => {
      const originalResponse = new Response(
        '<html><body><esi:include src="https://example.com/content" /></body></html>',
        { 
          headers: { 
            "Content-Type": "text/html",
            "Surrogate-Control": 'content="ESI/1.0"'
          },
          url: "https://example.com/page"
        }
      );

      const result = processEsiResponse(originalResponse, {
        contentTypes: ['text/xhtml']
      });
      
      // Should return the original response unchanged
      expect(result).toBe(originalResponse);
      const text = await result.text();
      expect(text).toContain("<esi:include");
    });

    it("should handle case-insensitive content type matching", async () => {
      const originalResponse = new Response(
        '<html><body><esi:include src="https://example.com/content" /></body></html>',
        { 
          headers: { 
            "Content-Type": "TEXT/HTML",
            "Surrogate-Control": 'content="ESI/1.0"'
          },
          url: "https://example.com/page"
        }
      );

      const mockFetch = async (url: string | Request) => {
        if (url === "https://example.com/content") {
          return new Response("<p>Processed content</p>");
        }
        return new Response("Not found", { status: 404 });
      };

      const result = processEsiResponse(originalResponse, { fetch: mockFetch });
      const text = await result.text();

      expect(text).toContain("<p>Processed content</p>");
      expect(text).not.toContain("<esi:include");
    });

    it("should use response URL as baseUrl when not provided", async () => {
      const originalResponse = new Response(
        '<html><body><esi:include src="/api/data" /></body></html>',
        { 
          headers: { 
            "Content-Type": "text/html",
            "Surrogate-Control": 'content="ESI/1.0"'
          },
          url: "https://example.com/page"
        }
      );

      const mockFetch = async (url: string | Request) => {
        if (url === "https://example.com/page/api/data") {
          return new Response("<data>Data</data>");
        }
        return new Response("Not found", { status: 404 });
      };

      const result = processEsiResponse(originalResponse, { fetch: mockFetch });
      const text = await result.text();

      expect(text).toContain("<data>Data</data>");
    });

    it("should return original response if body is null", () => {
      const originalResponse = new Response(null, { status: 204 });

      const result = processEsiResponse(originalResponse);

      expect(result).toBe(originalResponse);
    });

    it("should override baseUrl when provided", async () => {
      const originalResponse = new Response(
        '<html><body><esi:include src="/api/data" /></body></html>',
        { 
          headers: { 
            "Content-Type": "text/html",
            "Surrogate-Control": 'content="ESI/1.0"'
          },
          url: "https://example.com/page"
        }
      );

      const mockFetch = async (url: string | Request) => {
        if (url === "https://api.example.com/api/data") {
          return new Response("<data>API Data</data>");
        }
        return new Response("Not found", { status: 404 });
      };

      const result = processEsiResponse(originalResponse, { 
        baseUrl: "https://api.example.com",
        fetch: mockFetch 
      });
      const text = await result.text();

      expect(text).toContain("<data>API Data</data>");
    });
  });

  describe("addSurrogateCapability", () => {
    it("should add Surrogate-Capability header to a Request", () => {
      const request = new Request("https://example.com/page");
      const requestWithCapability = addSurrogateCapability(request);
      
      const capability = requestWithCapability.headers.get("Surrogate-Capability");
      expect(capability).toBe('cloudflare-workers="ESI/1.0"');
    });

    it("should append to existing Surrogate-Capability header", () => {
      const request = new Request("https://example.com/page", {
        headers: {
          "Surrogate-Capability": 'other-surrogate="ESI/1.0"'
        }
      });
      const requestWithCapability = addSurrogateCapability(request);
      
      const capability = requestWithCapability.headers.get("Surrogate-Capability");
      expect(capability).toContain('other-surrogate="ESI/1.0"');
      expect(capability).toContain('cloudflare-workers="ESI/1.0"');
    });

    it("should allow custom capability token", () => {
      const request = new Request("https://example.com/page");
      const requestWithCapability = addSurrogateCapability(request, "ESI/2.0");
      
      const capability = requestWithCapability.headers.get("Surrogate-Capability");
      expect(capability).toBe('cloudflare-workers="ESI/2.0"');
    });

    it("should preserve other headers", () => {
      const request = new Request("https://example.com/page", {
        headers: {
          "Authorization": "Bearer token123",
          "User-Agent": "MyApp/1.0"
        }
      });
      const requestWithCapability = addSurrogateCapability(request);
      
      expect(requestWithCapability.headers.get("Authorization")).toBe("Bearer token123");
      expect(requestWithCapability.headers.get("User-Agent")).toBe("MyApp/1.0");
      expect(requestWithCapability.headers.get("Surrogate-Capability")).toBe('cloudflare-workers="ESI/1.0"');
    });
  });

  describe("onerror option", () => {
    it("should remove element by default (empty string)", async () => {
      const html = '<html><body><esi:include src="https://example.com/404" /></body></html>';
      
      const mockFetch = async () => {
        return new Response("Not found", { status: 404 });
      };

      const result = parseEsi(html, { fetch: mockFetch });
      const text = await result.text();

      expect(text).not.toContain("<esi:include");
      expect(text).not.toContain("Not found");
    });

    it("should remove element when onerror returns empty string", async () => {
      const html = '<html><body><esi:include src="https://example.com/404" /></body></html>';
      
      const mockFetch = async () => {
        return new Response("Not found", { status: 404 });
      };

      const result = parseEsi(html, { 
        fetch: mockFetch,
        onerror: () => ''
      });
      const text = await result.text();

      expect(text).not.toContain("<esi:include");
      expect(text).not.toContain("Not found");
    });

    it("should replace element with custom content on error response", async () => {
      const html = '<html><body><esi:include src="https://example.com/404" /></body></html>';
      
      const mockFetch = async () => {
        return new Response("Not found", { status: 404 });
      };

      const result = parseEsi(html, { 
        fetch: mockFetch,
        onerror: () => '<div class="error">Failed to load content</div>'
      });
      const text = await result.text();

      expect(text).not.toContain("<esi:include");
      expect(text).toContain('<div class="error">Failed to load content</div>');
    });

    it("should replace element with custom content on network error", async () => {
      const html = '<html><body><esi:include src="https://example.com/error" /></body></html>';
      
      const mockFetch = async () => {
        throw new Error("Network error");
      };

      const result = parseEsi(html, { 
        fetch: mockFetch,
        onerror: () => '<div class="error">Network error occurred</div>'
      });
      const text = await result.text();

      expect(text).not.toContain("<esi:include");
      expect(text).toContain('<div class="error">Network error occurred</div>');
    });

    it("should replace element with HTML content on error", async () => {
      const html = '<html><body><esi:include src="https://example.com/500" /></body></html>';
      
      const mockFetch = async () => {
        return new Response("Server error", { status: 500, statusText: "Internal Server Error" });
      };

      const result = parseEsi(html, { 
        fetch: mockFetch,
        onerror: () => '<div class="error"><h2>Error</h2><p>Content unavailable</p></div>'
      });
      const text = await result.text();

      expect(text).toContain('<div class="error"><h2>Error</h2><p>Content unavailable</p></div>');
      expect(text).not.toContain("<esi:include");
    });

    it("should work with processEsiResponse", async () => {
      const originalResponse = new Response(
        '<html><body><esi:include src="https://example.com/404" /></body></html>',
        { 
          headers: { 
            "Content-Type": "text/html",
            "Surrogate-Control": 'content="ESI/1.0"'
          },
          url: "https://example.com/page"
        }
      );

      const mockFetch = async () => {
        return new Response("Not found", { status: 404 });
      };

      const result = processEsiResponse(originalResponse, { 
        fetch: mockFetch,
        onerror: () => '<div>Fallback content</div>'
      });
      const text = await result.text();

      expect(text).toContain('<div>Fallback content</div>');
      expect(text).not.toContain("<esi:include");
    });

    it("should support callback function for dynamic error handling", async () => {
      const html = '<html><body><esi:include src="https://example.com/404" /></body></html>';
      
      const mockFetch = async () => {
        return new Response("Not found", { status: 404 });
      };

      const onerror = (error: Error, request: Request, response?: Response) => {
        return `<div class="error">Failed to load: ${request.url} (${response?.status})</div>`;
      };

      const result = parseEsi(html, { 
        fetch: mockFetch,
        onerror
      });
      const text = await result.text();

      expect(text).not.toContain("<esi:include");
      expect(text).toContain('<div class="error">Failed to load: https://example.com/404 (404)</div>');
    });

    it("should support callback function that returns empty string to remove element", async () => {
      const html = '<html><body><esi:include src="https://example.com/404" /></body></html>';
      
      const mockFetch = async () => {
        return new Response("Not found", { status: 404 });
      };

      const onerror = () => '';

      const result = parseEsi(html, { 
        fetch: mockFetch,
        onerror
      });
      const text = await result.text();

      expect(text).not.toContain("<esi:include");
      expect(text).not.toContain("Not found");
    });

    it("should pass response to callback for non-OK responses", async () => {
      const html = '<html><body><esi:include src="https://example.com/500" /></body></html>';
      
      const mockFetch = async () => {
        return new Response("Server error", { status: 500, statusText: "Internal Server Error" });
      };

      let receivedResponse: Response | undefined;
      const onerror = (error: Error, request: Request, response?: Response) => {
        receivedResponse = response;
        return `<div>Error: ${response?.status} ${response?.statusText}</div>`;
      };

      const result = parseEsi(html, { 
        fetch: mockFetch,
        onerror
      });
      const text = await result.text();

      expect(receivedResponse).toBeDefined();
      expect(receivedResponse?.status).toBe(500);
      expect(receivedResponse?.statusText).toBe("Internal Server Error");
      expect(text).toContain('<div>Error: 500 Internal Server Error</div>');
    });

    it("should not pass response to callback for network errors", async () => {
      const html = '<html><body><esi:include src="https://example.com/error" /></body></html>';
      
      const mockFetch = async () => {
        throw new Error("Connection timeout");
      };

      let receivedResponse: Response | undefined;
      const onerror = (error: Error, request: Request, response?: Response) => {
        receivedResponse = response;
        return `<div>Error: ${error.message}</div>`;
      };

      const result = parseEsi(html, { 
        fetch: mockFetch,
        onerror
      });
      const text = await result.text();

      expect(receivedResponse).toBeUndefined();
      expect(text).toContain('<div>Error: Connection timeout</div>');
    });

    it("should support callback with conditional logic based on status", async () => {
      const html = '<html><body><esi:include src="https://example.com/404" /></body></html>';
      
      const mockFetch = async () => {
        return new Response("Not found", { status: 404 });
      };

      const onerror = (error: Error, request: Request, response?: Response) => {
        if (response?.status === 404) {
          return '<div class="not-found">Content not found</div>';
        }
        return `<div class="error">Error: ${error.message}</div>`;
      };

      const result = parseEsi(html, { 
        fetch: mockFetch,
        onerror
      });
      const text = await result.text();

      expect(text).toContain('<div class="not-found">Content not found</div>');
      expect(text).not.toContain("<esi:include");
    });

    it("should provide Request object with URL and other properties", async () => {
      const html = '<html><body><esi:include src="https://example.com/404" /></body></html>';
      
      const mockFetch = async () => {
        return new Response("Not found", { status: 404 });
      };

      let receivedRequest: Request | undefined;
      const onerror = (error: Error, request: Request, response?: Response) => {
        receivedRequest = request;
        return `<div>Error loading ${request.url}</div>`;
      };

      const result = parseEsi(html, { 
        fetch: mockFetch,
        onerror
      });
      const text = await result.text();

      expect(receivedRequest).toBeDefined();
      expect(receivedRequest?.url).toBe("https://example.com/404");
      expect(receivedRequest?.method).toBe("GET");
      expect(text).toContain('<div>Error loading https://example.com/404</div>');
    });
  });

  describe("recursion depth", () => {
    it("should process nested ESI includes up to maxDepth", async () => {
      const html = '<html><body><esi:include src="https://example.com/level1" /></body></html>';
      
      let fetchCount = 0;
      const mockFetch = async (url: string | Request) => {
        fetchCount++;
        const urlStr = typeof url === 'string' ? url : url.url;
        
        if (urlStr === "https://example.com/level1") {
          return new Response(
            '<div>Level 1<esi:include src="https://example.com/level2" /></div>',
            {
              headers: {
                "Content-Type": "text/html",
                "Surrogate-Control": 'content="ESI/1.0"'
              }
            }
          );
        }
        if (urlStr === "https://example.com/level2") {
          return new Response(
            '<div>Level 2<esi:include src="https://example.com/level3" /></div>',
            {
              headers: {
                "Content-Type": "text/html",
                "Surrogate-Control": 'content="ESI/1.0"'
              }
            }
          );
        }
        if (urlStr === "https://example.com/level3") {
          return new Response('<div>Level 3</div>');
        }
        return new Response("Not found", { status: 404 });
      };

      const result = parseEsi(html, { 
        fetch: mockFetch,
        maxDepth: 3
      });
      const text = await result.text();

      expect(text).toContain("Level 1");
      expect(text).toContain("Level 2");
      expect(text).toContain("Level 3");
      expect(fetchCount).toBe(3);
    });

    it("should stop processing when maxDepth is exceeded", async () => {
      const html = '<html><body><esi:include src="https://example.com/level1" /></body></html>';
      
      let errorHandlerCalled = false;
      const mockFetch = async (url: string | Request) => {
        const urlStr = typeof url === 'string' ? url : url.url;
        
        if (urlStr === "https://example.com/level1") {
          return new Response(
            '<div>Level 1<esi:include src="https://example.com/level2" /></div>',
            {
              headers: {
                "Content-Type": "text/html",
                "Surrogate-Control": 'content="ESI/1.0"'
              }
            }
          );
        }
        if (urlStr === "https://example.com/level2") {
          return new Response(
            '<div>Level 2<esi:include src="https://example.com/level3" /></div>',
            {
              headers: {
                "Content-Type": "text/html",
                "Surrogate-Control": 'content="ESI/1.0"'
              }
            }
          );
        }
        return new Response("Not found", { status: 404 });
      };

      const onerror = (error: Error) => {
        if (error.message.includes("recursion depth exceeded")) {
          errorHandlerCalled = true;
        }
        return '';
      };

      const result = parseEsi(html, { 
        fetch: mockFetch,
        maxDepth: 2,
        onerror
      });
      const text = await result.text();

      expect(text).toContain("Level 1");
      expect(text).toContain("Level 2");
      expect(text).not.toContain("Level 3");
      expect(errorHandlerCalled).toBe(true);
    });
  });

  describe("allowedUrlPatterns", () => {
    it("should allow URLs matching URLPattern", async () => {
      const html = '<html><body><esi:include src="https://example.com/api/data" /></body></html>';
      
      const mockFetch = async (url: string | Request) => {
        const urlStr = typeof url === 'string' ? url : url.url;
        if (urlStr === "https://example.com/api/data") {
          return new Response("<data>API Data</data>");
        }
        return new Response("Not found", { status: 404 });
      };

      const result = parseEsi(html, {
        fetch: mockFetch,
        allowedUrlPatterns: [new URLPattern({ pathname: '/api/*' })]
      });
      const text = await result.text();

      expect(text).toContain("<data>API Data</data>");
      expect(text).not.toContain("<esi:include");
    });

    it("should reject URLs not matching URLPattern", async () => {
      const html = '<html><body><esi:include src="https://example.com/other/data" /></body></html>';
      
      let errorHandlerCalled = false;
      const mockFetch = async () => {
        return new Response("Should not be fetched", { status: 200 });
      };

      const onerror = (error: Error) => {
        if (error.message.includes("not allowed")) {
          errorHandlerCalled = true;
        }
        return '';
      };

      const result = parseEsi(html, {
        fetch: mockFetch,
        allowedUrlPatterns: [new URLPattern({ pathname: '/api/*' })],
        onerror
      });
      const text = await result.text();

      expect(text).not.toContain("Should not be fetched");
      expect(errorHandlerCalled).toBe(true);
    });

    it("should allow URLs matching string pattern", async () => {
      const html = '<html><body><esi:include src="https://trusted.com/data" /></body></html>';
      
      const mockFetch = async (url: string | Request) => {
        const urlStr = typeof url === 'string' ? url : url.url;
        if (urlStr === "https://trusted.com/data") {
          return new Response("<data>Trusted Data</data>");
        }
        return new Response("Not found", { status: 404 });
      };

      const result = parseEsi(html, {
        fetch: mockFetch,
        allowedUrlPatterns: ['https://trusted.com/*']
      });
      const text = await result.text();

      expect(text).toContain("<data>Trusted Data</data>");
      expect(text).not.toContain("<esi:include");
    });

    it("should allow all URLs when allowedUrlPatterns is not provided", async () => {
      const html = '<html><body><esi:include src="https://any-domain.com/data" /></body></html>';
      
      const mockFetch = async (url: string | Request) => {
        const urlStr = typeof url === 'string' ? url : url.url;
        if (urlStr === "https://any-domain.com/data") {
          return new Response("<data>Any Data</data>");
        }
        return new Response("Not found", { status: 404 });
      };

      const result = parseEsi(html, {
        fetch: mockFetch
      });
      const text = await result.text();

      expect(text).toContain("<data>Any Data</data>");
      expect(text).not.toContain("<esi:include");
    });

    it("should match any pattern in the array", async () => {
      const html = '<html><body><esi:include src="https://example.com/static/file" /></body></html>';
      
      const mockFetch = async (url: string | Request) => {
        const urlStr = typeof url === 'string' ? url : url.url;
        if (urlStr === "https://example.com/static/file") {
          return new Response("<file>Static File</file>");
        }
        return new Response("Not found", { status: 404 });
      };

      const result = parseEsi(html, {
        fetch: mockFetch,
        allowedUrlPatterns: [
          new URLPattern({ pathname: '/api/*' }),
          new URLPattern({ pathname: '/static/*' })
        ]
      });
      const text = await result.text();

      expect(text).toContain("<file>Static File</file>");
      expect(text).not.toContain("<esi:include");
    });
  });
});

