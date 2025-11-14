import { describe, it, expect } from "vitest";
import { Esi } from "../src/index";
import { getUrlString } from "./helpers";

describe("Esi.parse", () => {
  it("should replace esi:include with fetched content", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/content" /></body></html>';

    const mockFetch = async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/content") {
        return new Response("<p>Included content</p>");
      }
      return new Response("Not found", { status: 404 });
    };

    const esi = new Esi({ fetchHandler: mockFetch, shim: true });
    const result = await esi.parseHtml(html, "https://example.com");
    const text = await result.text();

    expect(text).toContain("<p>Included content</p>");
    expect(text).not.toContain("<esi:include");
  });

  it("should handle multiple esi:include tags", async () => {
    const html = `
      <html>
        <body>
          <esi:include src="https://example.com/header" />
          <main>Main content</main>
          <esi:include src="https://example.com/footer" />
        </body>
      </html>
    `;

    const mockFetch = async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/header") {
        return new Response("<header>Header</header>");
      }
      if (url === "https://example.com/footer") {
        return new Response("<footer>Footer</footer>");
      }
      return new Response("Not found", { status: 404 });
    };

    const esi = new Esi({ fetchHandler: mockFetch, shim: true });
    const result = await esi.parseHtml(html, "https://example.com");
    const text = await result.text();

    expect(text).toContain("<header>Header</header>");
    expect(text).toContain("<footer>Footer</footer>");
    expect(text).toContain("Main content");
    expect(text).not.toContain("<esi:include");
  });

  it("should resolve relative URLs using baseUrl", async () => {
    const html = '<html><body><esi:include src="/api/content" /></body></html>';

    const mockFetch = async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/api/content") {
        return new Response("<div>API Content</div>");
      }
      return new Response("Not found", { status: 404 });
    };

    const esi = new Esi({
      fetchHandler: mockFetch,
      shim: true,
    });
    const result = await esi.parseHtml(html, "https://example.com");
    const text = await result.text();

    expect(text).toContain("<div>API Content</div>");
    expect(text).not.toContain("<esi:include");
  });

  it("should remove esi:include tag when src attribute is missing", async () => {
    const html = "<html><body><esi:include /></body></html>";

    const esi = new Esi({ shim: true });
    const result = await esi.parseHtml(html, "https://example.com");
    const text = await result.text();

    expect(text).not.toContain("<esi:include");
  });

  it("should remove esi:include tag on fetch error", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/error" /></body></html>';

    const mockFetch = async () => {
      throw new Error("Network error");
    };

    const esi = new Esi({ fetchHandler: mockFetch, shim: true });
    const result = await esi.parseHtml(html, "https://example.com");
    const text = await result.text();

    expect(text).not.toContain("<esi:include");
  });

  it("should remove esi:include tag when response is not OK", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/404" /></body></html>';

    const mockFetch = async () => {
      return new Response("Not found", { status: 404 });
    };

    const esi = new Esi({ fetchHandler: mockFetch, shim: true });
    const result = await esi.parseHtml(html, "https://example.com");
    const text = await result.text();

    expect(text).not.toContain("<esi:include");
  });

  it("should handle ReadableStream input", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/content" /></body></html>';
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(html));
        controller.close();
      },
    });

    const mockFetch = async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/content") {
        return new Response("<span>Streamed content</span>");
      }
      return new Response("Not found", { status: 404 });
    };

    const esi = new Esi({ fetchHandler: mockFetch, shim: true });
    const result = await esi.parseHtml(stream, "https://example.com");
    const text = await result.text();

    expect(text).toContain("<span>Streamed content</span>");
    expect(text).not.toContain("<esi:include");
  });

  it("should preserve HTML structure around includes", async () => {
    const html = `
      <html>
        <head><title>Test</title></head>
        <body>
          <div class="container">
            <esi:include src="https://example.com/widget" />
          </div>
        </body>
      </html>
    `;

    const mockFetch = async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/widget") {
        return new Response('<div class="widget">Widget</div>');
      }
      return new Response("Not found", { status: 404 });
    };

    const esi = new Esi({ fetchHandler: mockFetch, shim: true });
    const result = await esi.parseHtml(html, "https://example.com");
    const text = await result.text();

    expect(text).toContain("<title>Test</title>");
    expect(text).toContain('<div class="container">');
    expect(text).toContain('<div class="widget">Widget</div>');
  });

  it("should handle HTML content in included response", async () => {
    const html =
      '<html><body><esi:include src="https://example.com/html" /></body></html>';

    const mockFetch = async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/html") {
        return new Response(
          "<h1>Title</h1><p>Paragraph with <strong>bold</strong> text</p>",
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const esi = new Esi({ fetchHandler: mockFetch, shim: true });
    const result = await esi.parseHtml(html, "https://example.com");
    const text = await result.text();

    expect(text).toContain("<h1>Title</h1>");
    expect(text).toContain("<p>Paragraph with <strong>bold</strong> text</p>");
  });
});
