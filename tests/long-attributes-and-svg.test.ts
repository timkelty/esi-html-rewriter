import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Esi } from "../src/index";
import { getUrlString, createEsiResponse } from "./helpers";
import SVG_CONTENT from "./img.svg?raw";

describe("Esi.parseResponse with long attributes and SVG", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should handle HTML with long data-srcset attribute", async () => {
    const html = `
      <html>
        <body>
          <img
            class="lazy-img lazyload "
            data-srcset="https://anbldjnhalurny4.cloudfront.net/uploads/_h_xl/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 1600w,
                 https://anbldjnhalurny4.cloudfront.net/uploads/_h_lg/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 1200w,
                 https://anbldjnhalurny4.cloudfront.net/uploads/_h_md/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 800w,
                 https://anbldjnhalurny4.cloudfront.net/uploads/_h_sm/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 400w"
            data-src="https://anbldjnhalurny4.cloudfront.net/uploads/_h_lg/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg"
            data-sizes="auto"
            alt=""
          />
        </body>
      </html>
    `;

    const esi = new Esi({ shim: true });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    // Verify the long attribute is preserved
    expect(text).toContain(
      'data-srcset="https://anbldjnhalurny4.cloudfront.net/uploads/_h_xl/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 1600w',
    );
    expect(text).toContain(
      'https://anbldjnhalurny4.cloudfront.net/uploads/_h_sm/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 400w"',
    );
    expect(text).toContain(
      'data-src="https://anbldjnhalurny4.cloudfront.net/uploads/_h_lg/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg"',
    );
    expect(text).toContain('class="lazy-img lazyload "');
  });

  it("should handle inline SVG content", async () => {
    const html = `
      <html>
        <body>
          <div class="svg-container">
            ${SVG_CONTENT}
          </div>
        </body>
      </html>
    `;

    const esi = new Esi({ shim: true });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    // Verify SVG content is preserved
    expect(text).toContain('<svg display="none"');
    expect(text).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(text).toContain('<symbol id="logo-1"');
    expect(text).toContain("</svg>");
    // Verify the SVG is complete by checking for content near the end
    expect(text).toContain("</defs>");
    expect(text).toContain("</symbol>");
  });

  it("should handle ESI includes with long attributes in the same document", async () => {
    const html = `
      <html>
        <body>
          <img
            class="lazy-img lazyload "
            data-srcset="https://anbldjnhalurny4.cloudfront.net/uploads/_h_xl/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 1600w,
                 https://anbldjnhalurny4.cloudfront.net/uploads/_h_lg/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 1200w,
                 https://anbldjnhalurny4.cloudfront.net/uploads/_h_md/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 800w,
                 https://anbldjnhalurny4.cloudfront.net/uploads/_h_sm/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 400w"
            data-src="https://anbldjnhalurny4.cloudfront.net/uploads/_h_lg/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg"
            data-sizes="auto"
            alt=""
          />
          <esi:include src="https://example.com/content" />
        </body>
      </html>
    `;

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/content") {
        return new Response("<p>Included content</p>");
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

    // Verify long attribute is preserved
    expect(text).toContain(
      'data-srcset="https://anbldjnhalurny4.cloudfront.net/uploads/_h_xl/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 1600w',
    );
    // Verify ESI include was processed
    expect(text).toContain("<p>Included content</p>");
    expect(text).not.toContain("<esi:include");
  });

  it("should handle ESI includes with inline SVG in the same document", async () => {
    const html = `
      <html>
        <body>
          <div class="svg-container">
            ${SVG_CONTENT}
          </div>
          <esi:include src="https://example.com/footer" />
        </body>
      </html>
    `;

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = getUrlString(input);
      if (url === "https://example.com/footer") {
        return new Response("<footer>Footer content</footer>");
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

    // Verify SVG content is preserved
    expect(text).toContain('<svg display="none"');
    expect(text).toContain("</svg>");
    // Verify ESI include was processed
    expect(text).toContain("<footer>Footer content</footer>");
    expect(text).not.toContain("<esi:include");
  });

  it("should preserve full content length with long attributes", async () => {
    const html = `
      <html>
        <body>
          <img
            class="lazy-img lazyload "
            data-srcset="https://anbldjnhalurny4.cloudfront.net/uploads/_h_xl/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 1600w,
                 https://anbldjnhalurny4.cloudfront.net/uploads/_h_lg/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 1200w,
                 https://anbldjnhalurny4.cloudfront.net/uploads/_h_md/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 800w,
                 https://anbldjnhalurny4.cloudfront.net/uploads/_h_sm/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 400w"
            data-src="https://anbldjnhalurny4.cloudfront.net/uploads/_h_lg/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg"
            data-sizes="auto"
            alt=""
          />
          <p>Content at the end</p>
        </body>
      </html>
    `;

    const esi = new Esi({ shim: true });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    // Verify content at the beginning
    expect(text).toContain("<html>");
    // Verify content in the middle (long attribute)
    expect(text).toContain(
      'data-srcset="https://anbldjnhalurny4.cloudfront.net/uploads/_h_xl/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 1600w',
    );
    // Verify content at the end (not truncated)
    expect(text).toContain("<p>Content at the end</p>");
    expect(text).toContain("</body>");
    expect(text).toContain("</html>");
  });

  it("should preserve full SVG content length", async () => {
    const html = `
      <html>
        <body>
          <div class="svg-container">
            ${SVG_CONTENT}
          </div>
          <p>Content after SVG</p>
        </body>
      </html>
    `;

    const esi = new Esi({ shim: true });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    // Verify SVG start
    expect(text).toContain('<svg display="none"');
    // Verify SVG end (ensures it wasn't truncated)
    expect(text).toContain("</svg>");
    // Verify content after SVG (ensures full document is preserved)
    expect(text).toContain("<p>Content after SVG</p>");
    expect(text).toContain("</body>");
    expect(text).toContain("</html>");
  });

  it("should handle multiple long attributes in the same document", async () => {
    const html = `
      <html>
        <body>
          <img
            class="lazy-img lazyload "
            data-srcset="https://anbldjnhalurny4.cloudfront.net/uploads/_h_xl/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 1600w,
                 https://anbldjnhalurny4.cloudfront.net/uploads/_h_lg/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 1200w,
                 https://anbldjnhalurny4.cloudfront.net/uploads/_h_md/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 800w,
                 https://anbldjnhalurny4.cloudfront.net/uploads/_h_sm/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 400w"
            data-src="https://anbldjnhalurny4.cloudfront.net/uploads/_h_lg/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg"
            data-sizes="auto"
            alt=""
          />
          <img
            class="lazy-img lazyload "
            data-srcset="https://another-long-url.example.com/image1.jpg 1600w,
                 https://another-long-url.example.com/image2.jpg 1200w,
                 https://another-long-url.example.com/image3.jpg 800w"
            data-src="https://another-long-url.example.com/image1.jpg"
            alt="Second image"
          />
        </body>
      </html>
    `;

    const esi = new Esi({ shim: true });
    const { response, request } = createEsiResponse(
      html,
      "https://example.com",
    );
    const result = await esi.parseResponse(response, [request]);
    const text = await result.text();

    // Verify both long attributes are preserved
    expect(text).toContain(
      'data-srcset="https://anbldjnhalurny4.cloudfront.net/uploads/_h_xl/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg 1600w',
    );
    expect(text).toContain(
      'data-srcset="https://another-long-url.example.com/image1.jpg 1600w',
    );
    expect(text).toContain('alt="Second image"');
  });
});
