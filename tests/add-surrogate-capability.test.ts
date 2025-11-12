import { describe, it, expect } from "vitest";
import { addSurrogateCapability } from "../src/index";

describe("addSurrogateCapability", () => {
  it("should add Surrogate-Capability header to a Request", () => {
    const request = new Request("https://example.com/page");
    const requestWithCapability = addSurrogateCapability(request);

    const capability = requestWithCapability.headers.get(
      "Surrogate-Capability",
    );
    expect(capability).toBe('cloudflare-workers="ESI/1.0"');
  });

  it("should append to existing Surrogate-Capability header", () => {
    const request = new Request("https://example.com/page", {
      headers: {
        "Surrogate-Capability": 'other-surrogate="ESI/1.0"',
      },
    });
    const requestWithCapability = addSurrogateCapability(request);

    const capability = requestWithCapability.headers.get(
      "Surrogate-Capability",
    );
    expect(capability).toContain('other-surrogate="ESI/1.0"');
    expect(capability).toContain('cloudflare-workers="ESI/1.0"');
  });

  it("should allow custom capability token", () => {
    const request = new Request("https://example.com/page");
    const requestWithCapability = addSurrogateCapability(request, "ESI/2.0");

    const capability = requestWithCapability.headers.get(
      "Surrogate-Capability",
    );
    expect(capability).toBe('cloudflare-workers="ESI/2.0"');
  });

  it("should preserve other headers", () => {
    const request = new Request("https://example.com/page", {
      headers: {
        Authorization: "Bearer token123",
        "User-Agent": "MyApp/1.0",
      },
    });
    const requestWithCapability = addSurrogateCapability(request);

    expect(requestWithCapability.headers.get("Authorization")).toBe(
      "Bearer token123",
    );
    expect(requestWithCapability.headers.get("User-Agent")).toBe("MyApp/1.0");
    expect(requestWithCapability.headers.get("Surrogate-Capability")).toBe(
      'cloudflare-workers="ESI/1.0"',
    );
  });
});
