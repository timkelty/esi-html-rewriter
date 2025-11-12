import { describe, it, expect } from "vitest";
import {
  parseEsi,
  processEsiResponse,
  type OnErrorHandler,
} from "../src/index";

describe("onError option", () => {
  it("should remove element by default (empty string)", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/404" /></body></html>';

    const mockFetch = async () => {
      return new Response("Not found", { status: 404 });
    };

    const result = parseEsi(html, { fetch: mockFetch });
    const text = await result.text();

    expect(text).not.toContain("<esi:include");
    expect(text).not.toContain("Not found");
  });

  it("should remove element when onError returns empty string", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/404" /></body></html>';

    const mockFetch = async () => {
      return new Response("Not found", { status: 404 });
    };

    const result = parseEsi(html, {
      fetch: mockFetch,
      onError: () => "",
    });
    const text = await result.text();

    expect(text).not.toContain("<esi:include");
    expect(text).not.toContain("Not found");
  });

  it("should replace element with custom content on error response", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/404" /></body></html>';

    const mockFetch = async () => {
      return new Response("Not found", { status: 404 });
    };

    const result = parseEsi(html, {
      fetch: mockFetch,
      onError: () => '<div class="error">Failed to load content</div>',
    });
    const text = await result.text();

    expect(text).not.toContain("<esi:include");
    expect(text).toContain('<div class="error">Failed to load content</div>');
  });

  it("should replace element with custom content on network error", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/error" /></body></html>';

    const mockFetch = async () => {
      throw new Error("Network error");
    };

    const result = parseEsi(html, {
      fetch: mockFetch,
      onError: () => '<div class="error">Network error occurred</div>',
    });
    const text = await result.text();

    expect(text).not.toContain("<esi:include");
    expect(text).toContain('<div class="error">Network error occurred</div>');
  });

  it("should replace element with HTML content on error", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/500" /></body></html>';

    const mockFetch = async () => {
      return new Response("Server error", {
        status: 500,
        statusText: "Internal Server Error",
      });
    };

    const result = parseEsi(html, {
      fetch: mockFetch,
      onError: () =>
        '<div class="error"><h2>Error</h2><p>Content unavailable</p></div>',
    });
    const text = await result.text();

    expect(text).toContain(
      '<div class="error"><h2>Error</h2><p>Content unavailable</p></div>',
    );
    expect(text).not.toContain("<esi:include");
  });

  it("should work with processEsiResponse", async () => {
    const originalResponse = new Response(
      '<html><body><esi:include src="https://example.com/404" /></body></html>',
      {
        headers: {
          "Content-Type": "text/html",
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      },
    );

    const mockFetch = async () => {
      return new Response("Not found", { status: 404 });
    };

    const result = processEsiResponse(originalResponse, {
      fetch: mockFetch,
      onError: () => "<div>Fallback content</div>",
    });
    const text = await result.text();

    expect(text).toContain("<div>Fallback content</div>");
    expect(text).not.toContain("<esi:include");
  });

  it("should support callback function for dynamic error handling", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/404" /></body></html>';

    const mockFetch = async () => {
      return new Response("Not found", { status: 404 });
    };

    const onError: OnErrorHandler = (error, request, response) => {
      return `<div class="error">Failed to load: ${request.url} (${response?.status})</div>`;
    };

    const result = parseEsi(html, {
      fetch: mockFetch,
      onError,
    });
    const text = await result.text();

    expect(text).not.toContain("<esi:include");
    expect(text).toContain(
      '<div class="error">Failed to load: https://example.com/404 (404)</div>',
    );
  });

  it("should support callback function that returns empty string to remove element", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/404" /></body></html>';

    const mockFetch = async () => {
      return new Response("Not found", { status: 404 });
    };

    const onError = () => "";

    const result = parseEsi(html, {
      fetch: mockFetch,
      onError,
    });
    const text = await result.text();

    expect(text).not.toContain("<esi:include");
    expect(text).not.toContain("Not found");
  });

  it("should pass response to callback for non-OK responses", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/500" /></body></html>';

    const mockFetch = async () => {
      return new Response("Server error", {
        status: 500,
        statusText: "Internal Server Error",
      });
    };

    let receivedResponse: Response | undefined;
    const onError: OnErrorHandler = (error, request, response) => {
      receivedResponse = response;
      return `<div>Error: ${response?.status} ${response?.statusText}</div>`;
    };

    const result = parseEsi(html, {
      fetch: mockFetch,
      onError,
    });
    const text = await result.text();

    expect(receivedResponse).toBeDefined();
    expect(receivedResponse?.status).toBe(500);
    expect(receivedResponse?.statusText).toBe("Internal Server Error");
    expect(text).toContain("<div>Error: 500 Internal Server Error</div>");
  });

  it("should not pass response to callback for network errors", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/error" /></body></html>';

    const mockFetch = async () => {
      throw new Error("Connection timeout");
    };

    let receivedResponse: Response | undefined;
    const onError: OnErrorHandler = (error, request, response) => {
      receivedResponse = response;
      return `<div>Error: ${error.message}</div>`;
    };

    const result = parseEsi(html, {
      fetch: mockFetch,
      onError,
    });
    const text = await result.text();

    expect(receivedResponse).toBeUndefined();
    expect(text).toContain("<div>Error: Connection timeout</div>");
  });

  it("should support callback with conditional logic based on status", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/404" /></body></html>';

    const mockFetch = async () => {
      return new Response("Not found", { status: 404 });
    };

    const onError: OnErrorHandler = (error, request, response) => {
      if (response?.status === 404) {
        return '<div class="not-found">Content not found</div>';
      }
      return `<div class="error">Error: ${error.message}</div>`;
    };

    const result = parseEsi(html, {
      fetch: mockFetch,
      onError,
    });
    const text = await result.text();

    expect(text).toContain('<div class="not-found">Content not found</div>');
    expect(text).not.toContain("<esi:include");
  });

  it("should provide Request object with URL and other properties", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/404" /></body></html>';

    const mockFetch = async () => {
      return new Response("Not found", { status: 404 });
    };

    let receivedRequest: Request | undefined;
    const onError: OnErrorHandler = (error, request, response) => {
      receivedRequest = request;
      return `<div>Error loading ${request.url}</div>`;
    };

    const result = parseEsi(html, {
      fetch: mockFetch,
      onError,
    });
    const text = await result.text();

    expect(receivedRequest).toBeDefined();
    expect(receivedRequest?.url).toBe("https://example.com/404");
    expect(receivedRequest?.method).toBe("GET");
    expect(text).toContain("<div>Error loading https://example.com/404</div>");
  });
});
