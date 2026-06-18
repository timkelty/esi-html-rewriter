import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Esi, type EsiErrorContext } from "../src/index";
import { createEsiResponse } from "./helpers";

describe("error handling", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should remove element on error response", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/404" /></body></html>';

    const mockFetch = vi.fn(async () => {
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({ shim: true });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    expect(text).not.toContain("<esi-include");
    expect(text).not.toContain("Not found");
  });

  it("should remove element on network error", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/error" /></body></html>';

    const mockFetch = vi.fn(async () => {
      throw new Error("Network error");
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({ shim: true });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    expect(text).not.toContain("<esi-include");
  });

  it("should remove element on server error", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/500" /></body></html>';

    const mockFetch = vi.fn(async () => {
      return new Response("Server error", {
        status: 500,
        statusText: "Internal Server Error",
      });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({ shim: true });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    expect(text).not.toContain("<esi-include");
  });

  it("should remove element on error with parseResponse", async () => {
    const originalResponse = new Response(
      '<html><body><esi:include src="https://example.com/404" /></body></html>',
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

    const mockFetch = vi.fn(async () => {
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      shim: true,
    });
    const request = new Request(
      originalResponse.url || "https://example.com/page",
    );
    const result = await esi.parseResponse(originalResponse, [request]);
    const text = await result.text();

    expect(text).not.toContain("<esi-include");
    expect(text).not.toContain("Not found");
  });

  it("should call custom onError handler", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/404" /></body></html>';

    const mockFetch = vi.fn(async () => {
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const onError = vi.fn((error: unknown, element: Element) => {
      element.replace("<!-- Custom error handler -->", { html: true });
    });

    const esi = new Esi({ shim: true, onError });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    expect(onError).toHaveBeenCalledTimes(1);
    const errorArg = onError.mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(Error);
    expect((errorArg as Error).message).toBe("ESI include response not OK");
    expect(text).toContain("<!-- Custom error handler -->");
    expect(text).not.toContain("<esi-include");
  });

  it("should call custom onError handler with context for error responses", async () => {
    const html =
      '<html><body><esi:include src="/missing?via=esi" /></body></html>';

    const mockFetch = vi.fn(async () => {
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const onError = vi.fn(
      (_error: unknown, element: Element, _context: EsiErrorContext) => {
        element.remove();
      },
    );

    const response = new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Surrogate-Control": 'content="ESI/1.0"',
      },
    });
    const request = new Request("https://example.com/page", {
      headers: { "X-Parent-Request": "yes" },
    });

    const esi = new Esi({ shim: true, onError });
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    expect(onError).toHaveBeenCalledTimes(1);
    const [errorArg, elementArg, contextArg] = onError.mock.calls[0];

    expect(errorArg).toBeInstanceOf(Error);
    expect(contextArg.error).toBe(errorArg);
    expect(contextArg.element).toBe(elementArg);
    expect(contextArg.request.url).toBe("https://example.com/page");
    expect(contextArg.response.headers.get("Content-Type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(contextArg.includeRequest.url).toBe(
      "https://example.com/missing?via=esi",
    );
    expect(contextArg.includeRequest.headers.get("X-Parent-Request")).toBe(
      "yes",
    );
    expect(text).not.toContain("<esi-include");
  });

  it("should call custom onError handler with context for fetch errors", async () => {
    const html =
      '<esi:include src="https://assets.example.com/error?via=esi" />';

    const mockFetch = vi.fn(async () => {
      throw new Error("Network error");
    });
    globalThis.fetch = mockFetch;

    const onError = vi.fn(
      (_error: unknown, element: Element, _context: EsiErrorContext) => {
        element.remove();
      },
    );

    const response = new Response(html, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Surrogate-Control": 'content="ESI/1.0"',
      },
    });
    const request = new Request("https://example.com/plain", {
      headers: { "X-Parent-Request": "yes" },
    });

    const esi = new Esi({ shim: true, onError });
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    expect(onError).toHaveBeenCalledTimes(1);
    const [errorArg, elementArg, contextArg] = onError.mock.calls[0];

    expect(errorArg).toBeInstanceOf(Error);
    expect(contextArg.error).toBe(errorArg);
    expect(contextArg.element).toBe(elementArg);
    expect(contextArg.request.url).toBe("https://example.com/plain");
    expect(contextArg.response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(contextArg.includeRequest.url).toBe(
      "https://assets.example.com/error?via=esi",
    );
    expect(
      contextArg.includeRequest.headers.get("X-Parent-Request"),
    ).toBeNull();
    expect(text).not.toContain("<esi-include");
  });

  it("should call custom onError handler with correct error details", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/error" /></body></html>';

    const mockFetch = vi.fn(async () => {
      throw new Error("Network error");
    });
    globalThis.fetch = mockFetch;

    const onError = vi.fn((error: unknown, element: Element) => {
      element.remove();
    });

    const esi = new Esi({ shim: true, onError });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    expect(onError).toHaveBeenCalledTimes(1);
    const errorArg = onError.mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(Error);
    expect((errorArg as Error).message).toBe("Network error");
    expect(text).not.toContain("<esi-include");
  });

  it("should use default onError when not provided", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/404" /></body></html>';

    const mockFetch = vi.fn(async () => {
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({ shim: true });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    expect(text).not.toContain("<esi-include");
    expect(text).not.toContain("Not found");
  });
});
