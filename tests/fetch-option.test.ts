import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Esi } from "../src/index";
import { createEsiResponse, getUrlString } from "./helpers";

describe("fetch option", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should use custom fetch handler", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/content" /></body></html>';

    const customFetch = vi.fn(
      async (request: Request, _requestContext: Request[]) => {
        if (request.url === "https://example.com/content") {
          return new Response("<p>Custom fetch content</p>", {
            headers: { "Content-Type": "text/html" },
          });
        }
        return new Response("Not found", { status: 404 });
      },
    );

    const esi = new Esi({ shim: true, fetch: customFetch });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, request);
    const text = await result.text();

    expect(customFetch).toHaveBeenCalled();
    expect(text).toContain("<p>Custom fetch content</p>");
    expect(text).not.toContain("<esi-include");
  });

  it("should pass requestContext array to custom fetch handler", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/level1" /></body></html>';

    const requestContextArrays: Request[][] = [];
    const customFetch = vi.fn(
      async (
        request: Request,
        requestContext: Request[],
      ): Promise<Response> => {
        requestContextArrays.push(requestContext);
        if (request.url.includes("level1")) {
          return new Response(
            '<esi:include src="https://example.com/level2" />',
            {
              headers: {
                "Content-Type": "text/html",
                "Surrogate-Control": 'content="ESI/1.0"',
              },
            },
          );
        }
        if (request.url.includes("level2")) {
          return new Response("<p>Level 2 content</p>", {
            headers: { "Content-Type": "text/html" },
          });
        }
        return new Response("Not found", { status: 404 });
      },
    );

    const esi = new Esi({ shim: true, fetch: customFetch, maxDepth: 5 });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, request);
    await result.text();

    expect(requestContextArrays.length).toBeGreaterThan(0);
    expect(requestContextArrays[0].length).toBe(1);
    expect(requestContextArrays.some((arr) => arr.length === 2)).toBe(true);
  });

  it("should use default fetch when not provided", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/content" /></body></html>';

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/content") {
        return new Response("<p>Default fetch content</p>", {
          headers: { "Content-Type": "text/html" },
        });
      }
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({ shim: true });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, request);
    const text = await result.text();

    expect(mockFetch).toHaveBeenCalled();
    expect(text).toContain("<p>Default fetch content</p>");
    expect(text).not.toContain("<esi-include");
  });

  it("should pass request with Surrogate-Capability header to custom fetch", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/content" /></body></html>';

    let capturedRequest: Request | null = null;
    const customFetch = vi.fn(
      async (request: Request, _requestContext: Request[]) => {
        capturedRequest = request.clone();
        return new Response("<p>Content</p>", {
          headers: { "Content-Type": "text/html" },
        });
      },
    );

    const esi = new Esi({ shim: true, fetch: customFetch });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, request);
    await result.text();

    expect(customFetch).toHaveBeenCalled();
    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest!.headers.get("Surrogate-Capability")).toBe(
      'cloudflare-workers="ESI/1.0"',
    );
  });

  it("should handle errors from custom fetch handler", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/error" /></body></html>';

    const customFetch = vi.fn(
      async (_request: Request, _requestContext: Request[]) => {
        throw new Error("Custom fetch error");
      },
    );

    const onError = vi.fn((error: unknown, element: Element) => {
      element.remove();
    });

    const esi = new Esi({ shim: true, fetch: customFetch, onError });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, request);
    const text = await result.text();

    expect(customFetch).toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    const errorArg = onError.mock.calls[0][0];
    expect((errorArg as Error).message).toBe("Custom fetch error");
    expect(text).not.toContain("<esi-include");
  });
});
