export function getUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  if (input instanceof Request) {
    return input.url;
  }
  return String(input);
}

export function createEsiResponse(
  html: string | ReadableStream,
  url: string,
): { response: Response; request: Request } {
  const response = new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Surrogate-Control": 'content="ESI/1.0"',
    },
  });
  Object.defineProperty(response, "url", {
    value: url,
    writable: false,
  });
  const request = new Request(url);
  return { response, request };
}
