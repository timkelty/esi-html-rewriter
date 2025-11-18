import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Esi } from "../src/index";
import { getUrlString } from "./helpers";

describe("Esi.handleRequest", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should fetch and process ESI includes from a Request", async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/page") {
        return new Response(
          '<html><body><esi:include src="https://example.com/content" /></body></html>',
          {
            headers: {
              "Content-Type": "text/html",
              "Surrogate-Control": 'content="ESI/1.0"',
            },
          },
        );
      }
      if (url === "https://example.com/content") {
        return new Response("<p>Processed content</p>");
      }
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      shim: true,
    });

    const request = new Request("https://example.com/page");
    const result = await esi.handleRequest(request);
    const text = await result.text();

    expect(text).toContain("<p>Processed content</p>");
    expect(text).not.toContain("<esi:include");
  });

  it("should return response unchanged if no Surrogate-Control header", async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/page") {
        return new Response(
          '<html><body><esi:include src="https://example.com/content" /></body></html>',
          {
            headers: {
              "Content-Type": "text/html",
            },
          },
        );
      }
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      shim: true,
    });

    const request = new Request("https://example.com/page");
    const result = await esi.handleRequest(request);
    const text = await result.text();

    expect(text).toContain("<esi:include");
  });

  it("should use fetch function", async () => {
    let fetchCalled = false;
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      fetchCalled = true;
      const url = getUrlString(input);
      if (url === "https://example.com/page") {
        return new Response(
          '<html><body><esi:include src="https://example.com/content" /></body></html>',
          {
            headers: {
              "Content-Type": "text/html",
              "Surrogate-Control": 'content="ESI/1.0"',
            },
          },
        );
      }
      if (url === "https://example.com/content") {
        return new Response("<p>Fetch content</p>");
      }
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      shim: true,
    });

    const request = new Request("https://example.com/page");
    const result = await esi.handleRequest(request);
    const text = await result.text();

    expect(fetchCalled).toBe(true);
    expect(text).toContain("<p>Fetch content</p>");
  });
});
