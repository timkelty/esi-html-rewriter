import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Esi } from "../src/index";
import { getUrlString } from "./helpers";

describe("Esi.parse with Response", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
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
    Object.defineProperty(originalResponse, "url", {
      value: "https://example.com/page",
      writable: false,
    });

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/content") {
        return new Response("<p>Processed content</p>");
      }
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      shim: true,
    });
    const request = new Request(originalResponse.url || "https://example.com/page");
    const result = await esi.parseResponse(originalResponse, request);
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

    const esi = new Esi();
    const request = new Request(originalResponse.url || "https://example.com/page");
    const result = await esi.parseResponse(originalResponse, request);

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
    Object.defineProperty(originalResponse, "url", {
      value: "https://example.com/page",
      writable: false,
    });

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/content") {
        return new Response("<p>Processed content</p>");
      }
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({ shim: true });
    const request = new Request(originalResponse.url || "https://example.com/page");
    const result = await esi.parseResponse(originalResponse, request);
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

    const esi = new Esi();
    const request = new Request(originalResponse.url || "https://example.com/page");
    const result = await esi.parseResponse(originalResponse, request);

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
    Object.defineProperty(originalResponse, "url", {
      value: "https://example.com/page",
      writable: false,
    });

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/content") {
        return new Response("<p>Processed content</p>");
      }
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({ shim: true });
    const request = new Request(originalResponse.url || "https://example.com/page");
    const result = await esi.parseResponse(originalResponse, request);
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
    Object.defineProperty(originalResponse, "url", {
      value: "https://example.com/page",
      writable: false,
    });

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/content") {
        return new Response("<p>Processed content</p>");
      }
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      contentTypes: ["text/xhtml", "text/html"],
      shim: true,
    });
    const request = new Request(originalResponse.url || "https://example.com/page");
    const result = await esi.parseResponse(originalResponse, request);
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

    const esi = new Esi({
      contentTypes: ["text/xhtml"],
    });
    const request = new Request(originalResponse.url || "https://example.com/page");
    const result = await esi.parseResponse(originalResponse, request);

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
    Object.defineProperty(originalResponse, "url", {
      value: "https://example.com/page",
      writable: false,
    });

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/content") {
        return new Response("<p>Processed content</p>");
      }
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({ shim: true });
    const request = new Request(originalResponse.url || "https://example.com/page");
    const result = await esi.parseResponse(originalResponse, request);
    const text = await result.text();

    expect(text).toContain("<p>Processed content</p>");
    expect(text).not.toContain("<esi:include");
  });

  it("should use response URL as baseUrl when not provided", async () => {
    const originalResponse = new Response(
      '<html><body><esi:include src="api/data" /></body></html>',
      {
        headers: {
          "Content-Type": "text/html",
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      },
    );
    Object.defineProperty(originalResponse, "url", {
      value: "https://example.com/page/",
      writable: false,
    });

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/page/api/data") {
        return new Response("<data>Data</data>");
      }
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      shim: true,
    });
    const request = new Request(originalResponse.url || "https://example.com/page/");
    const result = await esi.parseResponse(originalResponse, request);
    const text = await result.text();

    // Relative URL should be resolved correctly using request URL
    expect(text).toContain("<data>Data</data>");
  });

  it("should return original response if body is null", async () => {
    const originalResponse = new Response(null, { status: 204 });

    const esi = new Esi();
    const request = new Request(originalResponse.url || "https://example.com/page");
    const result = await esi.parseResponse(originalResponse, request);

    expect(result).toBe(originalResponse);
  });

  it("should use response URL for baseUrl", async () => {
    const originalResponse = new Response(
      '<html><body><esi:include src="/api/data" /></body></html>',
      {
        headers: {
          "Content-Type": "text/html",
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      },
    );
    Object.defineProperty(originalResponse, "url", {
      value: "https://api.example.com",
      writable: false,
    });

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://api.example.com/api/data") {
        return new Response("<data>API Data</data>");
      }
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      shim: true,
    });
    const request = new Request(originalResponse.url || "https://example.com/page");
    const result = await esi.parseResponse(originalResponse, request);
    const text = await result.text();

    expect(text).toContain("<data>API Data</data>");
  });
});
