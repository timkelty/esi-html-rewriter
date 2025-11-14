# ESI Parser for Cloudflare Workers

An ESI (Edge Side Includes) parser for Cloudflare Workers using HTMLRewriter.

## Features

- ✅ Supports `<esi:include src="...">` tags
- ✅ Uses Cloudflare's HTMLRewriter for efficient streaming parsing
- ✅ ESI/1.0 compliant: Only processes responses with `Surrogate-Control` header
- ✅ Configurable error handling via `onError` option
- ✅ Requires `html_rewriter_treats_esi_include_as_void_tag` compatibility flag

## Installation

If using this as a published package:

```bash
npm install esi-html-rewriter
```

If developing this package locally:

```bash
npm install
```

## Usage

### Basic Usage

```typescript
import {
  parseEsi,
  processEsiResponse,
  addSurrogateCapability,
} from "esi-html-rewriter";

// Parse HTML string or stream (bypasses Surrogate-Control check)
const html =
  '<html><body><esi:include src="https://example.com/content" /></body></html>';
const result = parseEsi(html);
const processed = await result.text();

// Process a Response (ESI/1.0 compliant - only processes if Surrogate-Control header is present)
const request = new Request("https://example.com/page");
const requestWithCapability = addSurrogateCapability(request);
const response = await fetch(requestWithCapability);
const processedResponse = processEsiResponse(response);
```

### ESI/1.0 Compliance

This library follows the ESI/1.0 specification for surrogate control:

1. **Advertise capabilities**: Use `addSurrogateCapability()` to add the `Surrogate-Capability` header to your requests, advertising that your worker can process ESI.

2. **Check for delegation**: The `processEsiResponse()` function only processes responses that include a `Surrogate-Control` header with `content="ESI/1.0"`, indicating the origin server has delegated ESI processing to your worker.

3. **Content type filtering**: By default, only responses with `Content-Type: text/html` are processed. You can customize this with the `contentTypes` option.

4. **Skip processing**: If the response doesn't meet the requirements (missing `Surrogate-Control` header or unsupported content type), `processEsiResponse()` returns the original response unchanged.

```typescript
// In your Cloudflare Worker
export default {
  async fetch(request: Request): Promise<Response> {
    // Add Surrogate-Capability header to advertise ESI support
    const requestWithCapability = addSurrogateCapability(request);

    // Fetch from origin
    const response = await fetch(requestWithCapability);

    // Only processes if response has Surrogate-Control: content="ESI/1.0"
    return processEsiResponse(response);
  },
};
```

## Configuration

The parser supports the following options:

- `baseUrl`: Base URL for resolving relative URLs in `src` attributes
- `fetch`: Custom fetch function (useful for testing or custom request handling)
- `contentTypes`: Array of content types that should be processed for ESI includes (default: `['text/html']`)
- `maxDepth`: Maximum recursion depth for nested ESI includes (default: `3`)
- `allowedUrlPatterns`: Array of URLPattern objects or pattern strings to restrict which URLs can be included (default: all URLs allowed)
- `onError`: Callback function that controls what happens when an ESI fetch returns an error response or fails
  - Called with `(error: Error, request: Request, response?: Response)`
  - Return a string to replace the element with. Return an empty string to remove the element
  - Default: Returns an empty string (removes the element)

### Error Handling Examples

```typescript
import { parseEsi, type OnErrorHandler } from "esi-html-rewriter";

const html =
  '<html><body><esi:include src="https://example.com/content" /></body></html>';

// Default behavior: removes element on error
const result1 = parseEsi(html);

// Replace with static fallback content on error
const result2 = parseEsi(html, {
  onError: () => '<div class="error">Content unavailable</div>',
});

// Use a callback for dynamic error handling
const onError: OnErrorHandler = (error, request, response) => {
  if (response?.status === 404) {
    return '<div class="not-found">Content not found</div>';
  }
  return `<div class="error">Failed to load: ${error.message}</div>`;
};

const result3 = parseEsi(html, { onError });
```

### Security and Recursion Examples

```typescript
import { parseEsi } from "esi-html-rewriter";

// Limit recursion depth to prevent infinite loops
const result1 = parseEsi(html, { maxDepth: 5 });

// Restrict which URLs can be included using URLPattern
const result2 = parseEsi(html, {
  allowedUrlPatterns: [
    new URLPattern({ pathname: "/api/*" }),
    "https://trusted-domain.com/*",
  ],
});

// Combine security options
const result3 = parseEsi(html, {
  maxDepth: 2,
  allowedUrlPatterns: ["/api/*", "/static/*"],
});
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

### Compatibility Flag Not Applied in Development

There is a [known bug](https://github.com/cloudflare/workerd/issues/5531) where the `html_rewriter_treats_esi_include_as_void_tag` compatibility flag is not being applied when running `wrangler dev` or tests with `@cloudflare/vitest-pool-workers`. This causes HTMLRewriter to throw a `TypeError: Parser error: Unsupported pseudo-class or pseudo-element in selector` when trying to use `esi:include` as an element selector.

**Workaround:** The flag works correctly in production deployments. For local development and testing, you may need to wait for a fix or use alternative testing methods.

**Status:** Tracked in [cloudflare/workerd#5531](https://github.com/cloudflare/workerd/issues/5531)
