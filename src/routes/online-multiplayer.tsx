import { createFileRoute } from "@tanstack/react-router";
import { SeoPage, seoHead } from "../playora/seo-pages";

export const Route = createFileRoute("/online-multiplayer")({
  head: () => seoHead("online-multiplayer"),
  component: () => <SeoPage page="online-multiplayer" />,
});
