import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Esi } from "../src/index";
import { getUrlString, createEsiResponse } from "./helpers";

describe("allowedUrlPatterns", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("should allow URLs matching URLPattern", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/api/data" /></body></html>';

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const urlStr = getUrlString(input);
      if (urlStr === "https://example.com/api/data") {
        return new Response("<data>API Data</data>");
      }
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      allowedUrlPatterns: [new URLPattern({ pathname: "/api/*" })],
      shim: true,
    });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, request);
    const text = await result.text();

    expect(text).toContain("<data>API Data</data>");
    expect(text).not.toContain("<esi:include");
  });

  it("should remove element when URL not matching URLPattern", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/other/data" /></body></html>';

    const mockFetch = vi.fn(async () => {
      return new Response("Should not be fetched", { status: 200 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      allowedUrlPatterns: [new URLPattern({ pathname: "/api/*" })],
      shim: true,
    });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, request);
    const text = await result.text();

    expect(text).not.toContain("Should not be fetched");
    expect(text).not.toContain("<esi-include");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should allow URLs matching string pattern", async () => {
    const html =
      '<html><body><esi:include src="https://trusted.com/data" /></body></html>';

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const urlStr = getUrlString(input);
      if (urlStr === "https://trusted.com/data") {
        return new Response("<data>Trusted Data</data>");
      }
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      allowedUrlPatterns: ["https://trusted.com/*"],
      shim: true,
    });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, request);
    const text = await result.text();

    expect(text).toContain("<data>Trusted Data</data>");
    expect(text).not.toContain("<esi:include");
  });

  it("should allow all URLs when allowedUrlPatterns is not provided", async () => {
    const html =
      '<html><body><esi:include src="https://any-domain.com/data" /></body></html>';

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const urlStr = getUrlString(input);
      if (urlStr === "https://any-domain.com/data") {
        return new Response("<data>Any Data</data>");
      }
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      shim: true,
    });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, request);
    const text = await result.text();

    expect(text).toContain("<data>Any Data</data>");
    expect(text).not.toContain("<esi:include");
  });

  it("should match any pattern in the array", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/static/file" /></body></html>';

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const urlStr = getUrlString(input);
      if (urlStr === "https://example.com/static/file") {
        return new Response("<file>Static File</file>");
      }
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      allowedUrlPatterns: [
        new URLPattern({ pathname: "/api/*" }),
        new URLPattern({ pathname: "/static/*" }),
      ],
      shim: true,
    });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, request);
    const text = await result.text();

    expect(text).toContain("<file>Static File</file>");
    expect(text).not.toContain("<esi:include");
  });
});
