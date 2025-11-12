import { describe, it, expect } from "vitest";
import { processEsiResponse } from "../src/index";
import { getUrlString } from "./helpers";

describe("processEsiResponse", () => {
  it("should process ESI includes in a Response with Surrogate-Control header", async () => {
    const originalResponse = new Response(
      '<html><body><esi:include src="https://example.com/content" /></body></html>',
      {
        headers: {
          "Content-Type": "text/html",
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      },
    );

    const mockFetch = async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/content") {
        return new Response("<p>Processed content</p>");
      }
      return new Response("Not found", { status: 404 });
    };

    const result = processEsiResponse(originalResponse, {
      fetch: mockFetch,
      baseUrl: "https://example.com/page",
    });
    const text = await result.text();

    expect(text).toContain("<p>Processed content</p>");
    expect(text).not.toContain("<esi:include");
  });

  it("should not process Response without Surrogate-Control header", async () => {
    const originalResponse = new Response(
      '<html><body><esi:include src="https://example.com/content" /></body></html>',
      {
        headers: { "Content-Type": "text/html" },
      },
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
          "Surrogate-Control": 'no-store, content="ESI/1.0", max-age=3600',
        },
      },
    );

    const mockFetch = async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
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
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      },
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
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      },
    );

    const mockFetch = async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
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
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      },
    );

    const mockFetch = async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/content") {
        return new Response("<p>Processed content</p>");
      }
      return new Response("Not found", { status: 404 });
    };

    const result = processEsiResponse(originalResponse, {
      fetch: mockFetch,
      contentTypes: ["text/xhtml", "text/html"],
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
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      },
    );

    const result = processEsiResponse(originalResponse, {
      contentTypes: ["text/xhtml"],
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
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      },
    );

    const mockFetch = async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
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
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      },
    );

    const mockFetch = async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/page/api/data") {
        return new Response("<data>Data</data>");
      }
      return new Response("Not found", { status: 404 });
    };

    const result = processEsiResponse(originalResponse, {
      fetch: mockFetch,
      baseUrl: "https://example.com/page",
    });
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
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      },
    );

    const mockFetch = async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://api.example.com/api/data") {
        return new Response("<data>API Data</data>");
      }
      return new Response("Not found", { status: 404 });
    };

    const result = processEsiResponse(originalResponse, {
      baseUrl: "https://api.example.com",
      fetch: mockFetch,
    });
    const text = await result.text();

    expect(text).toContain("<data>API Data</data>");
  });
});
