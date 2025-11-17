# ESI Parser for Cloudflare Workers

An ESI (Edge Side Includes) parser for Cloudflare Workers using HTMLRewriter.

## Features

- ✅ Supports `<esi:include src="...">` tags
- ✅ Uses Cloudflare's HTMLRewriter for efficient streaming parsing
- ✅ ESI/1.0 compliant: Only processes responses with `Surrogate-Control` header
- ✅ Automatic error logging with full error details
- ✅ Requires `html_rewriter_treats_esi_include_as_void_tag` compatibility flag

## Usage

### Basic Usage

```typescript
import { Esi } from "esi-html-rewriter";

const esi = new Esi({ shim: true });

// Process a Response (ESI/1.0 compliant - only processes if Surrogate-Control header is present)
// Esi.fetch automatically adds the Surrogate-Capability header to advertise ESI support
const request = new Request("https://example.com/page");
const processedResponse = await esi.fetch(request);

// Or process an existing Response
const response = new Response(html, {
  headers: {
    "Content-Type": "text/html",
    "Surrogate-Control": 'content="ESI/1.0"',
  },
});
const processed = await esi.parseResponse(response, [request]);
```

### ESI/1.0 Compliance

This library follows the ESI/1.0 specification for surrogate control:

1. **Advertise capabilities**: The `fetch()` method automatically adds the `Surrogate-Capability` header to requests, advertising that your worker can process ESI.

2. **Check for delegation**: When `surrogateDelegation` is enabled, the `parseResponse()` method checks if downstream surrogates can handle ESI processing. If so, it delegates the response without processing.

3. **Process only delegated content**: The `parseResponse()` method only processes Response objects that include a `Surrogate-Control` header with `content="ESI/1.0"`, indicating the origin server has delegated ESI processing to your worker.

4. **Content type filtering**: By default, only responses with `Content-Type: text/html` are processed. You can customize this with the `contentTypes` option.

5. **Skip processing**: If the response doesn't meet the requirements (missing `Surrogate-Control` header or unsupported content type), `parseResponse()` returns the original response unchanged.

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

- `contentTypes`: Array of content types that should be processed for ESI includes (default: `['text/html']`)
- `maxDepth`: Maximum recursion depth for nested ESI includes (default: `3`)
- `allowedUrlPatterns`: Array of `URLPattern` objects to restrict which URLs can be included (default: `[new URLPattern()]` - allows all URLs)
- `shim`: When `true`, replaces `<esi:include />` tags with `<esi-include></esi-include>` to work around compatibility flag issues (default: `false`)
- `onError`: Optional callback function `(error: unknown, element: Element) => void` for custom error handling. Default behavior removes the element and logs the error.
- `surrogateDelegation`: Surrogate Delegation - if `true` and the request has valid `Surrogate-Capability` headers indicating a downstream surrogate can handle ESI, the response will be returned without processing. If an array of strings, each string is treated as an IP address. Delegation only occurs if the connecting IP (`CF-Connecting-IP`) matches one of the provided IPs. (default: `false`)

### Error Handling

When an ESI include fails (network error, 404, etc.), by default the error is logged to `console.error` with full details (including error code, cause, stack trace, etc.) and the element is removed from the HTML. This allows processing to continue for other ESI includes even if one fails.

You can customize error handling by providing an `onError` callback:

```typescript
const esi = new Esi({
  shim: true,
  onError: (error, element) => {
    // Custom error handling - replace with error message, log to external service, etc.
    element.replace(
      `<!-- Error: ${error instanceof Error ? error.message : String(error)} -->`,
      { html: true },
    );
  },
});
```

### Security and Recursion Examples

```typescript
import { Esi } from "esi-html-rewriter";

// Limit recursion depth to prevent infinite loops
const esi1 = new Esi({ maxDepth: 5, shim: true });
const request1 = new Request("https://example.com/page");
const result1 = await esi1.fetch(request1);

// Restrict which URLs can be included using URLPattern
const esi2 = new Esi({
  allowedUrlPatterns: [
    new URLPattern({ pathname: "/api/*" }),
    new URLPattern({ origin: "https://trusted-domain.com", pathname: "/*" }),
  ],
  shim: true,
});
const request2 = new Request("https://example.com/page");
const result2 = await esi2.fetch(request2);

// Combine security options
const esi3 = new Esi({
  maxDepth: 2,
  allowedUrlPatterns: [
    new URLPattern({ pathname: "/api/*" }),
    new URLPattern({ pathname: "/static/*" }),
  ],
  shim: true,
});
const request3 = new Request("https://example.com/page");
const result3 = await esi3.fetch(request3);

// Custom error handling
const esi4 = new Esi({
  shim: true,
  onError: (error, element) => {
    console.error("ESI include failed:", error);
    element.replace("<!-- ESI include failed -->", { html: true });
  },
});

// Enable surrogate delegation
const esi5 = new Esi({
  shim: true,
  surrogateDelegation: true, // Delegate to downstream surrogates when possible
});

// Enable surrogate delegation with IP restrictions
const esi6 = new Esi({
  shim: true,
  surrogateDelegation: ["192.168.1.1", "10.0.0.1"], // Only delegate from these IPs
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

### Compatibility Flag Not Applied

There is a [known bug](https://github.com/cloudflare/workerd/issues/5531) where the `html_rewriter_treats_esi_include_as_void_tag` compatibility flag is not being applied in workerd, affecting both development (`wrangler dev`) and deployed workers. This causes HTMLRewriter to throw a `TypeError: Parser error: Unsupported pseudo-class or pseudo-element in selector` when trying to use `esi:include` as an element selector.

**Workaround:** Enable the `shim` option to automatically replace `<esi:include />` tags with `<esi-include></esi-include>` before processing. This allows the library to work around the compatibility flag issue:

```typescript
const esi = new Esi({ shim: true });
const request = new Request("https://example.com/page");
const processed = await esi.fetch(request);
// or
const processed = await esi.parseResponse(response, [request]);
```
