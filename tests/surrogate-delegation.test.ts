import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Esi } from "../src/index";
import { createEsiResponse } from "./helpers";

describe("surrogate delegation", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should not delegate when surrogateDelegation is false", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/content" /></body></html>';

    const mockFetch = vi.fn(async () => {
      return new Response("<p>Processed content</p>", {
        headers: {
          "Content-Type": "text/html",
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      shim: true,
      surrogateDelegation: false,
    });
    const request = new Request("https://example.com/page", {
      headers: {
        "Surrogate-Capability": 'downstream-surrogate="ESI/1.0"',
      },
    });
    const { response } = createEsiResponse(html, "https://example.com");
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    // Should process ESI includes, not delegate
    expect(text).toContain("<p>Processed content</p>");
    expect(text).not.toContain("<esi-include");
  });

  it("should delegate when surrogateDelegation is true and downstream supports ESI", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/content" /></body></html>';

    const mockFetch = vi.fn(async () => {
      return new Response("<p>Original content</p>", {
        headers: {
          "Content-Type": "text/html",
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      shim: true,
      surrogateDelegation: true,
    });
    const request = new Request("https://example.com/page", {
      headers: {
        "Surrogate-Capability": 'downstream-surrogate="ESI/1.0"',
      },
    });
    const { response } = createEsiResponse(html, "https://example.com");
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    // Should return response without processing (delegated)
    expect(text).toContain("<esi:include");
    expect(text).toContain("https://example.com/content");
  });

  it("should not delegate when downstream does not support ESI", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/content" /></body></html>';

    const mockFetch = vi.fn(async () => {
      return new Response("<p>Processed content</p>", {
        headers: {
          "Content-Type": "text/html",
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      shim: true,
      surrogateDelegation: true,
    });
    const request = new Request("https://example.com/page", {
      headers: {
        "Surrogate-Capability": 'downstream-surrogate="SSI/1.0"',
      },
    });
    const { response } = createEsiResponse(html, "https://example.com");
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    // Should process ESI includes since downstream doesn't support ESI
    expect(text).toContain("<p>Processed content</p>");
    expect(text).not.toContain("<esi-include");
  });

  it("should not delegate when Surrogate-Capability header is missing", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/content" /></body></html>';

    const mockFetch = vi.fn(async () => {
      return new Response("<p>Processed content</p>", {
        headers: {
          "Content-Type": "text/html",
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      shim: true,
      surrogateDelegation: true,
    });
    const request = new Request("https://example.com/page");
    const { response } = createEsiResponse(html, "https://example.com");
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    // Should process ESI includes since no Surrogate-Capability header
    expect(text).toContain("<p>Processed content</p>");
    expect(text).not.toContain("<esi-include");
  });

  it("should delegate when IP matches surrogateDelegation array", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/content" /></body></html>';

    const mockFetch = vi.fn(async () => {
      return new Response("<p>Original content</p>", {
        headers: {
          "Content-Type": "text/html",
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      shim: true,
      surrogateDelegation: ["192.168.1.1", "10.0.0.1"],
    });
    const request = new Request("https://example.com/page", {
      headers: {
        "Surrogate-Capability": 'downstream-surrogate="ESI/1.0"',
        "CF-Connecting-IP": "192.168.1.1",
      },
    });
    const { response } = createEsiResponse(html, "https://example.com");
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    // Should delegate when IP matches
    expect(text).toContain("<esi:include");
    expect(text).toContain("https://example.com/content");
  });

  it("should not delegate when IP does not match surrogateDelegation array", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/content" /></body></html>';

    const mockFetch = vi.fn(async () => {
      return new Response("<p>Processed content</p>", {
        headers: {
          "Content-Type": "text/html",
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      shim: true,
      surrogateDelegation: ["192.168.1.1", "10.0.0.1"],
    });
    const request = new Request("https://example.com/page", {
      headers: {
        "Surrogate-Capability": 'downstream-surrogate="ESI/1.0"',
        "CF-Connecting-IP": "192.168.1.2",
      },
    });
    const { response } = createEsiResponse(html, "https://example.com");
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    // Should process ESI includes when IP doesn't match
    expect(text).toContain("<p>Processed content</p>");
    expect(text).not.toContain("<esi-include");
  });

  it("should not delegate when CF-Connecting-IP is missing with IP array", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/content" /></body></html>';

    const mockFetch = vi.fn(async () => {
      return new Response("<p>Processed content</p>", {
        headers: {
          "Content-Type": "text/html",
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      shim: true,
      surrogateDelegation: ["192.168.1.1"],
    });
    const request = new Request("https://example.com/page", {
      headers: {
        "Surrogate-Capability": 'downstream-surrogate="ESI/1.0"',
      },
    });
    const { response } = createEsiResponse(html, "https://example.com");
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    // Should process ESI includes when CF-Connecting-IP is missing
    expect(text).toContain("<p>Processed content</p>");
    expect(text).not.toContain("<esi-include");
  });
});
