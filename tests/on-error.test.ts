import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Esi } from "../src/index";
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
    const result = await esi.parseResponse(response, request);
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
    const result = await esi.parseResponse(response, request);
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
    const result = await esi.parseResponse(response, request);
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
    const result = await esi.parseResponse(originalResponse, request);
    const text = await result.text();

    expect(text).not.toContain("<esi-include");
    expect(text).not.toContain("Not found");
  });
});
