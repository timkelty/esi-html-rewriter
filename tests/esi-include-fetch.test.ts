import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Esi } from "../src/index";
import { createEsiResponse, getUrlString } from "./helpers";

describe("ESI include fetch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should call global fetch", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/content" /></body></html>';

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/content") {
        return new Response("<p>Fetched content</p>", {
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
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    expect(mockFetch).toHaveBeenCalled();
    expect(text).toContain("<p>Fetched content</p>");
    expect(text).not.toContain("<esi-include");
  });

  it("should pass request with Surrogate-Capability header to fetch", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/content" /></body></html>';

    let capturedRequest: Request | null = null;
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (input instanceof Request) {
        capturedRequest = input.clone();
      }
      return new Response("<p>Content</p>", {
        headers: { "Content-Type": "text/html" },
      });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({ shim: true });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, [request]);
    await result.text();

    expect(mockFetch).toHaveBeenCalled();
    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest!.url).toBe("https://example.com/content");
    expect(capturedRequest!.headers.get("Surrogate-Capability")).toBe(
      'cloudflare-workers="ESI/1.0"',
    );
  });

  it("should handle errors from fetch", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/error" /></body></html>';

    const mockFetch = vi.fn(async (_input: RequestInfo | URL) => {
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

    expect(mockFetch).toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    const errorArg = onError.mock.calls[0][0];
    expect((errorArg as Error).message).toBe("Network error");
    expect(text).not.toContain("<esi-include");
  });
});
