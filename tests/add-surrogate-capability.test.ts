import { describe, it, expect } from "vitest";
import { Esi } from "../src/index";

describe("Esi.fetch automatically adds Surrogate-Capability", () => {
  it("should add Surrogate-Capability header to requests", async () => {
    let capturedRequest: Request | null = null;
    const mockFetch = async (input: RequestInfo | URL) => {
      if (input instanceof Request) {
        capturedRequest = input;
      }
      return new Response("OK", {
        headers: { "Content-Type": "text/html" },
      });
    };

    const esi = new Esi({ fetchHandler: mockFetch });
    const request = new Request("https://example.com/page");
    await esi.fetch(request);

    expect(capturedRequest).not.toBeNull();
    const capability = capturedRequest!.headers.get("Surrogate-Capability");
    expect(capability).toBe('cloudflare-workers="ESI/1.0"');
  });

  it("should append to existing Surrogate-Capability header", async () => {
    let capturedRequest: Request | null = null;
    const mockFetch = async (input: RequestInfo | URL) => {
      if (input instanceof Request) {
        capturedRequest = input;
      }
      return new Response("OK", {
        headers: { "Content-Type": "text/html" },
      });
    };

    const esi = new Esi({ fetchHandler: mockFetch });
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
    const mockFetch = async (input: RequestInfo | URL) => {
      if (input instanceof Request) {
        capturedRequest = input;
      }
      return new Response("OK", {
        headers: { "Content-Type": "text/html" },
      });
    };

    const esi = new Esi({ fetchHandler: mockFetch });
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
