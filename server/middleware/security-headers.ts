import { defineEventHandler, setResponseHeaders } from "h3";

export const securityHeaders = {
  "content-security-policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self' https:",
    "frame-ancestors 'self' https://*.grok-sandbox.com https://preview.grokgsac.com https://preview.grok.genai.mil https://preview.grok.mil",
    "script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https: wss:",
    "frame-src 'self' https:",
    "media-src 'self' blob:",
  ].join("; "),
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
} as const;

export default defineEventHandler((event) => {
  setResponseHeaders(event, securityHeaders);
});
