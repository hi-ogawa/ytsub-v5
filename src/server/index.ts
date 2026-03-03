import { RPCHandler } from "@orpc/server/fetch";
import { router } from "./rpc.ts";

const handler = new RPCHandler(router);

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api")) {
      const { response } = await handler.handle(request, {
        prefix: "/api",
      });
      if (response) return response;
    }

    return new Response("Not found", { status: 404 });
  },
};
