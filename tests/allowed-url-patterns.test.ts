import { describe, it, expect } from "vitest";
import { Esi, type ErrorHandler } from "../src/index";
import { getUrlString } from "./helpers";

describe("allowedUrlPatterns", () => {
  it("should allow URLs matching URLPattern", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/api/data" /></body></html>';

    const mockFetch = async (input: RequestInfo | URL) => {
      const urlStr = getUrlString(input);
      if (urlStr === "https://example.com/api/data") {
        return new Response("<data>API Data</data>");
      }
      return new Response("Not found", { status: 404 });
    };

    const esi = new Esi({
      fetchHandler: mockFetch,
      allowedUrlPatterns: [new URLPattern({ pathname: "/api/*" })],
      shim: true,
    });
    const result = await esi.parseHtml(html, "https://example.com");
    const text = await result.text();

    expect(text).toContain("<data>API Data</data>");
    expect(text).not.toContain("<esi:include");
  });

  it("should reject URLs not matching URLPattern", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/other/data" /></body></html>';

    let errorHandlerCalled = false;
    const mockFetch = async () => {
      return new Response("Should not be fetched", { status: 200 });
    };

    const errorHandler: ErrorHandler = (error) => {
      if (error.message.includes("not allowed")) {
        errorHandlerCalled = true;
      }
      return "";
    };

    const esi = new Esi({
      fetchHandler: mockFetch,
      allowedUrlPatterns: [new URLPattern({ pathname: "/api/*" })],
      errorHandler,
      shim: true,
    });
    const result = await esi.parseHtml(html, "https://example.com");
    const text = await result.text();

    expect(text).not.toContain("Should not be fetched");
    expect(errorHandlerCalled).toBe(true);
  });

  it("should allow URLs matching string pattern", async () => {
    const html =
      '<html><body><esi:include src="https://trusted.com/data" /></body></html>';

    const mockFetch = async (input: RequestInfo | URL) => {
      const urlStr = getUrlString(input);
      if (urlStr === "https://trusted.com/data") {
        return new Response("<data>Trusted Data</data>");
      }
      return new Response("Not found", { status: 404 });
    };

    const esi = new Esi({
      fetchHandler: mockFetch,
      allowedUrlPatterns: ["https://trusted.com/*"],
      shim: true,
    });
    const result = await esi.parseHtml(html, "https://example.com");
    const text = await result.text();

    expect(text).toContain("<data>Trusted Data</data>");
    expect(text).not.toContain("<esi:include");
  });

  it("should allow all URLs when allowedUrlPatterns is not provided", async () => {
    const html =
      '<html><body><esi:include src="https://any-domain.com/data" /></body></html>';

    const mockFetch = async (input: RequestInfo | URL) => {
      const urlStr = getUrlString(input);
      if (urlStr === "https://any-domain.com/data") {
        return new Response("<data>Any Data</data>");
      }
      return new Response("Not found", { status: 404 });
    };

    const esi = new Esi({
      fetchHandler: mockFetch,
      shim: true,
    });
    const result = await esi.parseHtml(html, "https://example.com");
    const text = await result.text();

    expect(text).toContain("<data>Any Data</data>");
    expect(text).not.toContain("<esi:include");
  });

  it("should match any pattern in the array", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/static/file" /></body></html>';

    const mockFetch = async (input: RequestInfo | URL) => {
      const urlStr = getUrlString(input);
      if (urlStr === "https://example.com/static/file") {
        return new Response("<file>Static File</file>");
      }
      return new Response("Not found", { status: 404 });
    };

    const esi = new Esi({
      fetchHandler: mockFetch,
      allowedUrlPatterns: [
        new URLPattern({ pathname: "/api/*" }),
        new URLPattern({ pathname: "/static/*" }),
      ],
      shim: true,
    });
    const result = await esi.parseHtml(html, "https://example.com");
    const text = await result.text();

    expect(text).toContain("<file>Static File</file>");
    expect(text).not.toContain("<esi:include");
  });
});
