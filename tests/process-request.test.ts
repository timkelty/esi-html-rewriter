import { describe, it, expect } from "vitest";
import { Esi } from "../src/index";
import { getUrlString } from "./helpers";

describe("Esi.fetch", () => {
  it("should fetch and process ESI includes from a Request", async () => {
    const mockFetch = async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/page") {
        return new Response(
          '<html><body><esi:include src="https://example.com/content" /></body></html>',
          {
            headers: {
              "Content-Type": "text/html",
              "Surrogate-Control": 'content="ESI/1.0"',
            },
          },
        );
      }
      if (url === "https://example.com/content") {
        return new Response("<p>Processed content</p>");
      }
      return new Response("Not found", { status: 404 });
    };

    const esi = new Esi({
      fetchHandler: mockFetch,
      shim: true,
    });

    const request = new Request("https://example.com/page");
    const result = await esi.fetch(request);
    const text = await result.text();

    expect(text).toContain("<p>Processed content</p>");
    expect(text).not.toContain("<esi:include");
  });

  it("should return response unchanged if no Surrogate-Control header", async () => {
    const mockFetch = async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/page") {
        return new Response(
          '<html><body><esi:include src="https://example.com/content" /></body></html>',
          {
            headers: {
              "Content-Type": "text/html",
            },
          },
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const esi = new Esi({
      fetchHandler: mockFetch,
      shim: true,
    });

    const request = new Request("https://example.com/page");
    const result = await esi.fetch(request);
    const text = await result.text();

    expect(text).toContain("<esi:include");
  });

  it("should use custom fetch function", async () => {
    let customFetchCalled = false;
    const customFetch = async (input: RequestInfo | URL) => {
      customFetchCalled = true;
      const url = getUrlString(input);
      if (url === "https://example.com/page") {
        return new Response(
          '<html><body><esi:include src="https://example.com/content" /></body></html>',
          {
            headers: {
              "Content-Type": "text/html",
              "Surrogate-Control": 'content="ESI/1.0"',
            },
          },
        );
      }
      if (url === "https://example.com/content") {
        return new Response("<p>Custom fetch content</p>");
      }
      return new Response("Not found", { status: 404 });
    };

    const esi = new Esi({
      fetchHandler: customFetch,
      shim: true,
    });

    const request = new Request("https://example.com/page");
    const result = await esi.fetch(request);
    const text = await result.text();

    expect(customFetchCalled).toBe(true);
    expect(text).toContain("<p>Custom fetch content</p>");
  });
});
