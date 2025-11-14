# ESI Parser for Cloudflare Workers

An ESI (Edge Side Includes) parser for Cloudflare Workers using HTMLRewriter.

## Features

- ✅ Supports `<esi:include src="...">` tags
- ✅ Uses Cloudflare's HTMLRewriter for efficient streaming parsing
- ✅ ESI/1.0 compliant: Only processes responses with `Surrogate-Control` header
- ✅ Configurable error handling via `errorHandler` option
- ✅ Requires `html_rewriter_treats_esi_include_as_void_tag` compatibility flag

## Usage

### Basic Usage

```typescript
import { Esi } from "esi-html-rewriter";

const esi = new Esi({ shim: true });

// Parse HTML string or stream (baseUrl required for relative URLs)
const html =
  '<html><body><esi:include src="https://example.com/content" /></body></html>';
const result = esi.parseHtml(html, "https://example.com");
const processed = await result.text();

// Process a Response (ESI/1.0 compliant - only processes if Surrogate-Control header is present)
// Esi.fetch automatically adds the Surrogate-Capability header to advertise ESI support
const request = new Request("https://example.com/page");
const processedResponse = await esi.fetch(request);
```

### ESI/1.0 Compliance

This library follows the ESI/1.0 specification for surrogate control:

1. **Advertise capabilities**: The `fetch()` method automatically adds the `Surrogate-Capability` header to requests, advertising that your worker can process ESI.

2. **Check for delegation**: The `parseResponse()` method only processes Response objects that include a `Surrogate-Control` header with `content="ESI/1.0"`, indicating the origin server has delegated ESI processing to your worker.

3. **Content type filtering**: By default, only responses with `Content-Type: text/html` are processed. You can customize this with the `contentTypes` option.

4. **Skip processing**: If the response doesn't meet the requirements (missing `Surrogate-Control` header or unsupported content type), `parseResponse()` returns the original response unchanged.

```typescript
// In your Cloudflare Worker
import { Esi } from "esi-html-rewriter";

export default {
  async fetch(request: Request): Promise<Response> {
    const esi = new Esi({ shim: true });

    // Fetch and process (automatically adds Surrogate-Capability header)
    // Only processes if response has Surrogate-Control: content="ESI/1.0"
    return esi.fetch(request);
  },
};
```

## Configuration

The parser supports the following options:

- `fetchHandler`: Custom fetch function (useful for testing or custom request handling)
- `errorHandler`: Callback function that controls what happens when an ESI fetch returns an error response or fails
  - Called with `(error: Error, request: Request, response?: Response)`
  - Return a string to replace the element with. Return an empty string to remove the element
  - Default: Returns an empty string (removes the element)
- `contentTypes`: Array of content types that should be processed for ESI includes (default: `['text/html']`)
- `maxDepth`: Maximum recursion depth for nested ESI includes (default: `3`)
- `allowedUrlPatterns`: Array of URLPattern objects or pattern strings to restrict which URLs can be included (default: all URLs allowed)
- `shim`: When `true`, replaces `<esi:include />` tags with `<esi-include></esi-include>` to work around compatibility flag issues (default: `false`)

### Error Handling Examples

```typescript
import { Esi, type ErrorHandler } from "esi-html-rewriter";

const html =
  '<html><body><esi:include src="https://example.com/content" /></body></html>';

// Default behavior: removes element on error
const esi1 = new Esi();
const result1 = esi1.parseHtml(html, "https://example.com");

// Replace with static fallback content on error
const esi2 = new Esi({
  errorHandler: () => '<div class="error">Content unavailable</div>',
});
const result2 = esi2.parseHtml(html, "https://example.com");

// Use a callback for dynamic error handling
const errorHandler: ErrorHandler = (error, request, response) => {
  if (response?.status === 404) {
    return '<div class="not-found">Content not found</div>';
  }
  return `<div class="error">Failed to load: ${error.message}</div>`;
};
const esi3 = new Esi({ errorHandler });
const result3 = esi3.parseHtml(html, "https://example.com");
```

### Security and Recursion Examples

```typescript
import { Esi } from "esi-html-rewriter";

// Limit recursion depth to prevent infinite loops
const esi1 = new Esi({ maxDepth: 5, shim: true });
const result1 = esi1.parseHtml(html, "https://example.com");

// Restrict which URLs can be included using URLPattern
const esi2 = new Esi({
  allowedUrlPatterns: [
    new URLPattern({ pathname: "/api/*" }),
    "https://trusted-domain.com/*",
  ],
  shim: true,
});
const result2 = esi2.parseHtml(html, "https://example.com");

// Combine security options
const esi3 = new Esi({
  maxDepth: 2,
  allowedUrlPatterns: ["/api/*", "/static/*"],
  shim: true,
});
const result3 = esi3.parseHtml(html, "https://example.com");
```

## Testing

Tests use Vitest with `@cloudflare/vitest-pool-workers`:

```bash
npm test
```

## Development

```bash
# Run tests in watch mode
npm run test:watch

# Run development server
npm run dev

# Deploy to Cloudflare
npm run deploy
```

## Requirements

- Cloudflare Workers runtime
- `html_rewriter_treats_esi_include_as_void_tag` compatibility flag enabled in `wrangler.jsonc`

## Known Issues

### Compatibility Flag Not Applied

There is a [known bug](https://github.com/cloudflare/workerd/issues/5531) where the `html_rewriter_treats_esi_include_as_void_tag` compatibility flag is not being applied in workerd, affecting both development (`wrangler dev`) and deployed workers. This causes HTMLRewriter to throw a `TypeError: Parser error: Unsupported pseudo-class or pseudo-element in selector` when trying to use `esi:include` as an element selector.

**Workaround:** Enable the `shim` option to automatically replace `<esi:include />` tags with `<esi-include></esi-include>` before processing. This allows the library to work around the compatibility flag issue:

```typescript
const esi = new Esi({ shim: true });
const result = esi.parseHtml(html, "https://example.com");
// or
const processed = esi.parseResponse(response, response.url);
```
