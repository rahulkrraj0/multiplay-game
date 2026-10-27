const SEO_PATHS = [
  "/",
  "/games/chess",
  "/games/tic-tac-toe",
  "/games/snakes-and-ladders",
  "/online-multiplayer",
  "/how-to-play",
  "/privacy-policy",
];

/**
 * @param {string | undefined} value
 * @returns {string | null}
 */
export function normalizePublicSiteUrl(value) {
  if (value === undefined || value.trim() === "") return null;

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("VITE_PUBLIC_SITE_URL must be a valid public HTTPS origin.");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "VITE_PUBLIC_SITE_URL must be the HTTPS site origin only, without credentials, a path, query, or fragment.",
    );
  }

  return url.origin;
}

/**
 * @param {string | undefined} configuredUrl
 * @param {string | undefined} vercelProductionUrl
 * @returns {string | null}
 */
export function resolvePublicSiteOrigin(configuredUrl, vercelProductionUrl) {
  const configured = configuredUrl?.trim();
  const vercelHost = vercelProductionUrl?.trim();
  const value = configured || (vercelHost ? `https://${vercelHost.replace(/^https?:\/\//, "")}` : undefined);
  return normalizePublicSiteUrl(value);
}

/**
 * @param {string} siteOrigin
 */
export function createPlayoraSeoArtifacts(siteOrigin) {
  const urls = SEO_PATHS.map((path) => `${siteOrigin}${path}`);
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${url}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");
  const robots = `User-agent: *\nAllow: /\nSitemap: ${siteOrigin}/sitemap.xml\n`;

  return { sitemap, robots };
}
