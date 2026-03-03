import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { Router } from "./server/rpc.ts";

const link = new RPCLink({
  url: new URL("/api", window.location.href),
});

const client: RouterClient<Router> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
