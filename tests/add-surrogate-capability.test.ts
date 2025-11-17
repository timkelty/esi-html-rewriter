import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Esi } from "../src/index";

describe("Esi.fetch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should pass request as-is to fetch", async () => {
    let capturedRequest: Request | null = null;
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (input instanceof Request) {
        capturedRequest = input;
      }
      return new Response("OK", {
        headers: { "Content-Type": "text/html" },
      });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi();
    const request = new Request("https://example.com/page");
    await esi.fetch(request);

    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest!.url).toBe("https://example.com/page");
    expect(capturedRequest!.headers.get("Surrogate-Capability")).toBe(
      'cloudflare-workers="ESI/1.0"',
    );
  });

  it("should preserve existing Surrogate-Capability header if present", async () => {
    let capturedRequest: Request | null = null;
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (input instanceof Request) {
        capturedRequest = input;
      }
      return new Response("OK", {
        headers: { "Content-Type": "text/html" },
      });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi();
    const request = new Request("https://example.com/page", {
      headers: {
        "Surrogate-Capability": 'other-surrogate="ESI/1.0"',
      },
    });
    await esi.fetch(request);

    expect(capturedRequest).not.toBeNull();
    const capability = capturedRequest!.headers.get("Surrogate-Capability");
    expect(capability).toContain('other-surrogate="ESI/1.0"');
    expect(capability).toContain('cloudflare-workers="ESI/1.0"');
  });

  it("should preserve other headers", async () => {
    let capturedRequest: Request | null = null;
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (input instanceof Request) {
        capturedRequest = input;
      }
      return new Response("OK", {
        headers: { "Content-Type": "text/html" },
      });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi();
    const request = new Request("https://example.com/page", {
      headers: {
        Authorization: "Bearer token123",
        "User-Agent": "MyApp/1.0",
      },
    });
    await esi.fetch(request);

    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest!.headers.get("Authorization")).toBe(
      "Bearer token123",
    );
    expect(capturedRequest!.headers.get("User-Agent")).toBe("MyApp/1.0");
    expect(capturedRequest!.headers.get("Surrogate-Capability")).toBe(
      'cloudflare-workers="ESI/1.0"',
    );
  });
});
