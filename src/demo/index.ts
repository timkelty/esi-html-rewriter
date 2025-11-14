import { processEsiResponse, addSurrogateCapability } from "../index";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      const exampleHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>ESI Parser Demo</title>
</head>
<body>
  <h1>ESI Parser Demo</h1>
  <p>This page demonstrates ESI includes:</p>
  
  <h2>Header Include:</h2>
  <esi:include src="/api/header" />
  
  <h2>Content Include:</h2>
  <esi:include src="/api/content" />
  
  <h2>Footer Include:</h2>
  <esi:include src="/api/footer" />
</body>
</html>`;

      const response = new Response(exampleHtml, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Surrogate-Control": 'content="ESI/1.0"',
        },
      });

      return processEsiResponse(response, {
        baseUrl: request.url,
        shim: true,
      });
    }

    if (url.pathname.startsWith("/api/")) {
      const endpoint = url.pathname.replace("/api/", "");

      if (endpoint === "header") {
        return new Response(
          '<div style="background: #f0f0f0; padding: 10px; border: 1px solid #ccc;">Header Content (from /api/header)</div>',
          {
            headers: { "Content-Type": "text/html" },
          },
        );
      }

      if (endpoint === "content") {
        return new Response(
          '<div style="padding: 20px; border: 1px solid #333;">Main Content (from /api/content)</div>',
          {
            headers: { "Content-Type": "text/html" },
          },
        );
      }

      if (endpoint === "footer") {
        return new Response(
          '<div style="background: #f0f0f0; padding: 10px; border: 1px solid #ccc;">Footer Content (from /api/footer)</div>',
          {
            headers: { "Content-Type": "text/html" },
          },
        );
      }

      return new Response("Not found", { status: 404 });
    }

    if (url.pathname === "/proxy") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) {
        return new Response("Missing 'url' query parameter", { status: 400 });
      }

      try {
        const targetRequest = new Request(targetUrl);
        const requestWithCapability = addSurrogateCapability(targetRequest);
        const response = await fetch(requestWithCapability);

        return processEsiResponse(response, {
          baseUrl: targetUrl,
        });
      } catch (error) {
        return new Response(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
          {
            status: 500,
          },
        );
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
