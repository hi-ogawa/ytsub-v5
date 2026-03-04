import { RPCHandler } from "@orpc/server/fetch";
import {
  RequestHeadersPlugin,
  ResponseHeadersPlugin,
} from "@orpc/server/plugins";
import { router } from "./rpc.ts";

const handler = new RPCHandler(router, {
  plugins: [new RequestHeadersPlugin(), new ResponseHeadersPlugin()],
});

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api")) {
      const { response } = await handler.handle(request, {
        prefix: "/api",
        context: {},
      });
      if (response) return response;
    }

    return new Response("Not found", { status: 404 });
  },
};
