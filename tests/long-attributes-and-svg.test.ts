import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Esi } from "../src/index";
import { getUrlString, createEsiResponse } from "./helpers";

// Inline SVG content for testing (from tests/img.svg)
const SVG_CONTENT = `<svg display="none" width="0" height="0" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <symbol id="logo-1" viewBox="0 0 349.71 64.29">
      <g>
        <path fill="var(--logo-fill, currentColor)" d="m46.18,7.39c.19-.2.4-.38.62-.56.18-.15.33-.33.44-.54.19-.38.26-.83.09-1.31-.16-.44-.5-.79-.92-1-1.22-.61-2.69-1.29-4.38-1.91C39.06.98,35.37.07,31.02,0c-.06,0-.11,0-.17,0-.05,0-.11,0-.16,0-.05,0-.1,0-.14,0-.06,0-.12,0-.18,0-.06,0-.12,0-.17,0-4.35.07-8.04.97-11.01,2.07-1.7.62-3.17,1.3-4.4,1.92-.41.21-.75.56-.9,1-.17.48-.1.94.1,1.32.1.19.24.36.41.5.22.18.44.36.64.57h0C6.04,12.73,0,22.54,0,33.73c0,15.11,11.01,27.7,25.42,30.17,0,0,0,0,0,0,1.1.19,2.21.32,3.35.38,0,0,0,0,0,0v-11.44h3.66v11.44c1.14-.07,2.25-.2,3.35-.38v-11.06h5.07v9.73c1.15-.41,2.27-.89,3.35-1.43,4-2,7.51-4.84,10.28-8.3.85-1.06,1.64-2.18,2.34-3.35h-12.63v-3.53h14.45c.48-1.09.89-2.21,1.24-3.35h-15.69v-3.53h16.54c.19-1.1.33-2.22.4-3.35.04-.66.07-1.32.07-1.99,0-11.2-6.05-21.01-15.04-26.35Zm-20.76,35.22h-10.19c-.93,0-1.68.75-1.68,1.68h0c0,.93.75,1.68,1.68,1.68h10.19v3.53h-7.75c-.93,0-1.68.75-1.68,1.68h0c0,.93.75,1.68,1.68,1.68h7.75v7.94c-12.72-2.43-22.36-13.64-22.36-27.06,0-10.67,6.09-18.89,14.98-22.83,1.2,1.58,2.28,3.24,3.18,5,1.73,3.44,2.83,7.13,3.47,10.93.14,1.02.25,1.96.34,2.8.31,3.04.37,5.38.39,6.09h-7.75c-.93,0-1.68.75-1.68,1.68h0c0,.93.75,1.68,1.68,1.68h7.75v3.53Zm7.02,6.89h-3.66v-3.53h3.66v3.53Zm0-6.89h-3.66v-3.53h3.66v3.53Zm.1-9.48c-.07,1.28-.09,2.19-.1,2.59h-3.66v-3.18c0-2.33,1.65-4.32,3.96-5.08-.09,1.9-.14,3.79-.19,5.67Zm2.55-19.32c-1.22,3.27-1.8,6.68-2.12,10.12-1.73.33-3.3,1.1-4.54,2.18-.02-.38-.05-.77-.08-1.15-.38-5.5-1.69-11.08-4.36-15.97-.09-.17-.18-.33-.27-.5-.7-1.26-1.49-2.47-2.34-3.63,2.57-.84,5.64-1.49,9.17-1.51,3.59,0,6.7.66,9.3,1.51-.95,1.32-1.83,2.7-2.6,4.13-.84,1.55-1.57,3.16-2.15,4.81Zm5.78,35.68h-5.07v-3.53h5.07v3.53Zm0-6.89h-5.07v-3.53h5.07v3.53Zm0-6.89h-5.07c.01-.72.08-3.05.39-6.09.07-.7.16-1.48.27-2.31,2.54.64,4.41,2.73,4.41,5.22v3.18Zm9.56,17.13c-1.82,1.89-3.91,3.52-6.21,4.83v-4.83h6.21Zm7.66-17.13h-13.87v-3.18c0-4.11-3.03-7.56-7.12-8.52.28-1.18.59-2.35.96-3.51,1.13-3.57,2.92-6.73,5.12-9.61,8.89,3.95,14.98,12.16,14.98,22.83,0,.67-.03,1.33-.07,1.99Z" stroke-width="0"/>
      </g>
    </symbol>
  </defs>
</svg>`;

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
            data-src="https://dgpuo8cwvztoe.cloudfront.net/uploads/_h_lg/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg"
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
      'data-src="https://dgpuo8cwvztoe.cloudfront.net/uploads/_h_lg/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg"',
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
            data-src="https://dgpuo8cwvztoe.cloudfront.net/uploads/_h_lg/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg"
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
            data-src="https://dgpuo8cwvztoe.cloudfront.net/uploads/_h_lg/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg"
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
            data-src="https://dgpuo8cwvztoe.cloudfront.net/uploads/_h_lg/some_LONG-Image_nameThatKeepsGoing2000x1250_v1.jpg"
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
