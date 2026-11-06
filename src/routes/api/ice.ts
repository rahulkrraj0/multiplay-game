import { createFileRoute } from "@tanstack/react-router";
import { getMeteredIceConfiguration } from "@/lib/multiplayer/ice-config.server";
import { getSql } from "@/lib/db";
import { enforceRequestRateLimit } from "@/lib/multiplayer/signaling.server";

export const Route = createFileRoute("/api/ice")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const rateLimit = await enforceRequestRateLimit(request, "ice-get", 20, getSql);
          if (rateLimit) return rateLimit;
          return Response.json(await getMeteredIceConfiguration(process.env), {
            headers: { "cache-control": "no-store" },
          });
        } catch (error) {
          console.error("[ice] TURN configuration request failed:", error);
          return Response.json({ error: "TURN configuration unavailable." }, { status: 503 });
        }
      },
    },
  },
});
