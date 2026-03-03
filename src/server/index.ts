import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { RPCHandler } from "@orpc/server/fetch";
import { router } from "./rpc.ts";

const rpcHandler = new RPCHandler(router);
const openApiHandler = new OpenAPIHandler(router);

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/rpc")) {
      const { response } = await rpcHandler.handle(request, {
        prefix: "/rpc",
      });
      if (response) return response;
    }

    if (url.pathname.startsWith("/api")) {
      const { response } = await openApiHandler.handle(request, {
        prefix: "/api",
      });
      if (response) return response;
    }

    return new Response("Not found", { status: 404 });
  },
};
