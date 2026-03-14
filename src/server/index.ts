import { RPCHandler } from "@orpc/server/fetch";
import {
  RequestHeadersPlugin,
  ResponseHeadersPlugin,
} from "@orpc/server/plugins";
import { router } from "./rpc.ts";

const handler = new RPCHandler(router, {
  plugins: [new RequestHeadersPlugin(), new ResponseHeadersPlugin()],
  interceptors: [
    async (options) => {
      try {
        return await options.next();
      } catch (e) {
        console.error(e);
        throw e;
      }
    },
  ],
});

function withCors(request: Request, response: Response): Response {
  const origin = request.headers.get("origin");
  if (!origin?.startsWith("chrome-extension://")) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-headers", "content-type, authorization");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-max-age", "86400");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight for extension requests
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api")) {
      return withCors(request, new Response(null, { status: 204 }));
    }

    if (url.pathname.startsWith("/api")) {
      const { response } = await handler.handle(request, {
        prefix: "/api",
        context: {},
      });
      if (response) return withCors(request, response);
    }

    return new Response("Not found", { status: 404 });
  },
};
