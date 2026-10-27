import { normalizePublicSiteUrl } from "../../scripts/playora-seo-artifacts.mjs";

export const publicSiteOrigin = normalizePublicSiteUrl(
  import.meta.env.VITE_PUBLIC_SITE_URL,
);

export function canonicalUrl(path: string) {
  return publicSiteOrigin ? `${publicSiteOrigin}${path}` : undefined;
}
