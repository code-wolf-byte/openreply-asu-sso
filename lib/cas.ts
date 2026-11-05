import { getBaseUrl } from "@/lib/env";

/**
 * ASU CAS single sign-on.
 *
 * Auth.js has no CAS provider, and its Credentials provider only works with
 * JWT sessions, so CAS runs as two plain route handlers instead
 * (app/api/auth/cas/login and /callback). The callback validates the ticket
 * here, then lib/cas-session.ts writes a database session the rest of the app
 * reads through auth() unchanged.
 *
 * Everything is off unless CAS_ENABLED=true, so a deployment that only uses
 * magic links is unaffected.
 */

const DEFAULT_CAS_BASE_URL = "https://weblogin.asu.edu/cas";
export const CAS_PROVIDER_ID = "asu-cas";
export const CAS_CALLBACK_PATH = "/api/auth/cas/callback";

// CAS servers differ in which attribute names they release; the first one
// present wins. Overridable per deployment with a comma-separated env var.
const DEFAULT_ATTRIBUTE_KEYS = {
  asurite: ["uid", "asuEduID", "asuEduPersonID", "eduPersonPrincipalName"],
  email: ["mail", "email"],
  name: ["displayName", "cn"],
} as const;

export type CasAttributeKey = keyof typeof DEFAULT_ATTRIBUTE_KEYS;
export type CasAttributes = Record<string, string[]>;

export type CasConfig = {
  loginUrl: string;
  validateUrl: string;
  logoutUrl: string | null;
  serviceUrl: string;
  emailDomain: string;
  attributeKeys: Record<CasAttributeKey, string[]>;
};

export type CasIdentity = {
  asurite: string;
  email: string;
  name: string | null;
  attributes: CasAttributes;
};

export function isCasEnabled(): boolean {
  return process.env.CAS_ENABLED?.trim().toLowerCase() === "true";
}

// Relative values hang off CAS_BASE_URL, matching how forklift reads them.
function resolveCasUrl(base: string, value: string | undefined, fallback: string) {
  const raw = value?.trim();
  if (!raw) return `${base}/${fallback}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${base}/${raw.replace(/^\/+/, "")}`;
}

function readAttributeKeys(name: string, fallback: readonly string[]): string[] {
  const keys = (process.env[name] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return keys.length > 0 ? keys : [...fallback];
}

export function getCasConfig(): CasConfig {
  const base = (process.env.CAS_BASE_URL?.trim() || DEFAULT_CAS_BASE_URL).replace(/\/+$/, "");
  return {
    loginUrl: resolveCasUrl(base, process.env.CAS_LOGIN_URL, "login"),
    validateUrl: resolveCasUrl(base, process.env.CAS_VALIDATE_URL, "serviceValidate"),
    logoutUrl: process.env.CAS_LOGOUT_URL?.trim() || null,
    serviceUrl:
      process.env.CAS_SERVICE_URL?.trim() ||
      `${getBaseUrl().replace(/\/+$/, "")}${CAS_CALLBACK_PATH}`,
    emailDomain: process.env.CAS_EMAIL_DOMAIN?.trim() || "asu.edu",
    attributeKeys: {
      asurite: readAttributeKeys("CAS_ATTR_ASURITE", DEFAULT_ATTRIBUTE_KEYS.asurite),
      email: readAttributeKeys("CAS_ATTR_EMAIL", DEFAULT_ATTRIBUTE_KEYS.email),
      name: readAttributeKeys("CAS_ATTR_NAME", DEFAULT_ATTRIBUTE_KEYS.name),
    },
  };
}

/**
 * Only same-origin paths survive the round trip through CAS. "//host" and
 * "/\host" are protocol-relative in browsers, so they are rejected too.
 */
export function safeCallbackPath(target: string | null | undefined): string | null {
  if (!target || !target.startsWith("/")) return null;
  if (target.startsWith("//") || target.startsWith("/\\")) return null;
  return target;
}

/**
 * The service URL has to be byte-identical at login and at validation, so the
 * post-login destination rides along in it rather than in a cookie.
 */
export function buildServiceUrl(config: CasConfig, callbackPath: string | null): string {
  const url = new URL(config.serviceUrl);
  if (callbackPath) url.searchParams.set("callbackUrl", callbackPath);
  return url.toString();
}

export function buildLoginUrl(config: CasConfig, callbackPath: string | null): string {
  const url = new URL(config.loginUrl);
  url.searchParams.set("service", buildServiceUrl(config, callbackPath));
  return url.toString();
}

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code =
        entity[1].toLowerCase() === "x"
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return XML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function findElement(xml: string, localName: string): { attrs: string; body: string } | null {
  const pattern = new RegExp(
    `<(?:[\\w-]+:)?${localName}\\b([^>]*)>([\\s\\S]*?)</(?:[\\w-]+:)?${localName}\\s*>`
  );
  const match = pattern.exec(xml);
  return match ? { attrs: match[1], body: match[2] } : null;
}

export type CasValidationResult =
  | { ok: true; user: string; attributes: CasAttributes }
  | { ok: false; reason: string };

/**
 * Parses a CAS 2.0/3.0 serviceValidate response. The documents are small and
 * fixed-shape, so this reads the elements it needs instead of pulling in an
 * XML library. Attributes are collected from every leaf element under
 * authenticationSuccess, which covers both the standard <cas:attributes>
 * block and older servers that release them as direct children.
 */
export function parseCasResponse(xml: string): CasValidationResult {
  const failure = findElement(xml, "authenticationFailure");
  if (failure) {
    const reason = decodeXml(failure.body.trim());
    const code = /code\s*=\s*["']([^"']+)["']/.exec(failure.attrs)?.[1];
    return { ok: false, reason: reason || code || "CAS authentication failed" };
  }

  const success = findElement(xml, "authenticationSuccess");
  if (!success) {
    return { ok: false, reason: "CAS response missing authenticationSuccess" };
  }

  const user = decodeXml(findElement(success.body, "user")?.body.trim() ?? "");
  const attributes: CasAttributes = {};
  const leaf = /<(?:([\w-]+):)?([\w.-]+)\b[^>]*>([^<]*)<\/(?:\1:)?\2\s*>/g;
  for (const match of success.body.matchAll(leaf)) {
    const tag = match[2];
    if (tag === "user" || tag === "proxyGrantingTicket") continue;
    const value = decodeXml(match[3].trim());
    if (value) (attributes[tag] ??= []).push(value);
  }

  if (!user) return { ok: false, reason: "CAS response missing user" };
  return { ok: true, user, attributes };
}

function firstAttribute(attributes: CasAttributes, keys: string[]): string | null {
  for (const key of keys) {
    const value = attributes[key]?.[0];
    if (value) return value;
  }
  return null;
}

export function extractCasIdentity(
  config: CasConfig,
  user: string,
  attributes: CasAttributes
): CasIdentity {
  const asurite = (firstAttribute(attributes, config.attributeKeys.asurite) ?? user)
    .trim()
    .toLowerCase();
  // ASU does not always release mail over CAS; every ASURITE has an
  // @asu.edu alias, so that is the fallback forklift uses as well.
  const email = (
    firstAttribute(attributes, config.attributeKeys.email) ?? `${asurite}@${config.emailDomain}`
  )
    .trim()
    .toLowerCase();
  return {
    asurite,
    email,
    name: firstAttribute(attributes, config.attributeKeys.name),
    attributes,
  };
}

export async function validateCasTicket(
  config: CasConfig,
  ticket: string,
  callbackPath: string | null
): Promise<CasValidationResult> {
  const url = new URL(config.validateUrl);
  url.searchParams.set("ticket", ticket);
  url.searchParams.set("service", buildServiceUrl(config, callbackPath));

  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return {
      ok: false,
      reason: `CAS validation request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!response.ok) {
    return { ok: false, reason: `CAS validation returned HTTP ${response.status}` };
  }
  return parseCasResponse(await response.text());
}
