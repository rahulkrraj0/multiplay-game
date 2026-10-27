import { createFileRoute } from "@tanstack/react-router";
import { SeoPage, seoHead } from "../playora/seo-pages";

export const Route = createFileRoute("/privacy-policy")({
  head: () => seoHead("privacy-policy"),
  component: () => <SeoPage page="privacy-policy" />,
});
