import { describe, it, expect } from "vitest";
import { parseEsi, type OnErrorHandler } from "../src/index";
import { getUrlString } from "./helpers";

describe("recursion depth", () => {
  it("should process nested ESI includes up to maxDepth", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/level1" /></body></html>';

    let fetchCount = 0;
    const mockFetch = async (input: RequestInfo | URL) => {
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
    };

    const result = parseEsi(html, {
      fetch: mockFetch,
      maxDepth: 3,
    });
    const text = await result.text();

    expect(text).toContain("Level 1");
    expect(text).toContain("Level 2");
    expect(text).toContain("Level 3");
    expect(fetchCount).toBe(3);
  });

  it("should stop processing when maxDepth is exceeded", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/level1" /></body></html>';

    let errorHandlerCalled = false;
    const mockFetch = async (input: RequestInfo | URL) => {
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
    };

    const onError: OnErrorHandler = (error) => {
      if (error.message.includes("recursion depth exceeded")) {
        errorHandlerCalled = true;
      }
      return "";
    };

    const result = parseEsi(html, {
      fetch: mockFetch,
      maxDepth: 2,
      onError,
    });
    const text = await result.text();

    expect(text).toContain("Level 1");
    expect(text).toContain("Level 2");
    expect(text).not.toContain("Level 3");
    expect(errorHandlerCalled).toBe(true);
  });
});
