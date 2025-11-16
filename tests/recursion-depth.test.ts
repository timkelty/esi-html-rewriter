import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Esi } from "../src/index";
import { getUrlString, createEsiResponse } from "./helpers";

describe("recursion depth", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("should process nested ESI includes up to maxDepth", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/level1" /></body></html>';

    let fetchCount = 0;
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      fetchCount++;
      const urlStr = getUrlString(input);

      if (urlStr === "https://example.com/level1") {
        return new Response(
          '<div>Level 1<esi:include src="https://example.com/level2" /></div>',
          {
            headers: {
              "Content-Type": "text/html",
              "Surrogate-Control": 'content="ESI/1.0"',
            },
          },
        );
      }
      if (urlStr === "https://example.com/level2") {
        return new Response(
          '<div>Level 2<esi:include src="https://example.com/level3" /></div>',
          {
            headers: {
              "Content-Type": "text/html",
              "Surrogate-Control": 'content="ESI/1.0"',
            },
          },
        );
      }
      if (urlStr === "https://example.com/level3") {
        return new Response("<div>Level 3</div>");
      }
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      maxDepth: 3,
      shim: true,
    });
    const { response, request } = createEsiResponse(html, "https://example.com");
    const result = await esi.parseResponse(response, request);
    const text = await result.text();

    expect(text).toContain("Level 1");
    expect(text).toContain("Level 2");
    expect(text).toContain("Level 3");
    expect(fetchCount).toBe(3);
  });

  it("should stop processing when maxDepth is exceeded", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/level1" /></body></html>';

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const urlStr = getUrlString(input);

      if (urlStr === "https://example.com/level1") {
        return new Response(
          '<div>Level 1<esi:include src="https://example.com/level2" /></div>',
          {
            headers: {
              "Content-Type": "text/html",
              "Surrogate-Control": 'content="ESI/1.0"',
            },
          },
        );
      }
      if (urlStr === "https://example.com/level2") {
        return new Response(
          '<div>Level 2<esi:include src="https://example.com/level3" /></div>',
          {
            headers: {
              "Content-Type": "text/html",
              "Surrogate-Control": 'content="ESI/1.0"',
            },
          },
        );
      }
      return new Response("Not found", { status: 404 });
    });
    globalThis.fetch = mockFetch;

    const esi = new Esi({
      maxDepth: 2,
      shim: true,
    });
    const { response, request } = createEsiResponse(html, "https://example.com");
    const result = await esi.parseResponse(response, request);
    const text = await result.text();

    expect(text).toContain("Level 1");
    expect(text).toContain("Level 2");
    // When maxDepth is exceeded, the element remains in HTML
    expect(text).toContain("<esi-include");
  });
});
