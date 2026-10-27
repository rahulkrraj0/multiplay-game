import { createFileRoute } from "@tanstack/react-router";
import { getMeteredIceConfiguration } from "@/lib/multiplayer/ice-config.server";

export const Route = createFileRoute("/api/ice")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return Response.json(await getMeteredIceConfiguration(process.env), {
            headers: { "cache-control": "no-store" },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "TURN configuration unavailable.";
          console.error("[ice] TURN configuration request failed:", message);
          return Response.json({ error: message }, { status: 503 });
        }
      },
    },
  },
});
