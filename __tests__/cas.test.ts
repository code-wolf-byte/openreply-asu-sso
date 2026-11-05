import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildLoginUrl,
  buildServiceUrl,
  extractCasIdentity,
  getCasConfig,
  parseCasResponse,
  safeCallbackPath,
  validateCasTicket,
} from "../lib/cas";

const SUCCESS_XML = `<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas">
  <cas:authenticationSuccess>
    <cas:user>SDevil</cas:user>
    <cas:attributes>
      <cas:mail>Sparky.Devil@asu.edu</cas:mail>
      <cas:displayName>Sparky &amp; Devil</cas:displayName>
      <cas:eduPersonAffiliation>student</cas:eduPersonAffiliation>
      <cas:eduPersonAffiliation>employee</cas:eduPersonAffiliation>
    </cas:attributes>
  </cas:authenticationSuccess>
</cas:serviceResponse>`;

const FAILURE_XML = `<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas">
  <cas:authenticationFailure code="INVALID_TICKET">
    Ticket ST-1 not recognized
  </cas:authenticationFailure>
</cas:serviceResponse>`;

const ENV_KEYS = [
  "NEXTAUTH_URL",
  "CAS_BASE_URL",
  "CAS_LOGIN_URL",
  "CAS_VALIDATE_URL",
  "CAS_SERVICE_URL",
  "CAS_ATTR_ASURITE",
];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.NEXTAUTH_URL = "https://openreply.example.asu.edu";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.unstubAllGlobals();
});

describe("parseCasResponse", () => {
  it("reads the user and multi-valued attributes from a success response", () => {
    expect(parseCasResponse(SUCCESS_XML)).toEqual({
      ok: true,
      user: "SDevil",
      attributes: {
        mail: ["Sparky.Devil@asu.edu"],
        displayName: ["Sparky & Devil"],
        eduPersonAffiliation: ["student", "employee"],
      },
    });
  });

  it("reads attributes released as direct children of authenticationSuccess", () => {
    const xml = `<serviceResponse><authenticationSuccess>
      <user>sdevil</user><uid>sdevil</uid>
    </authenticationSuccess></serviceResponse>`;
    expect(parseCasResponse(xml)).toEqual({
      ok: true,
      user: "sdevil",
      attributes: { uid: ["sdevil"] },
    });
  });

  it("returns the failure reason", () => {
    expect(parseCasResponse(FAILURE_XML)).toEqual({
      ok: false,
      reason: "Ticket ST-1 not recognized",
    });
  });

  it("rejects a response with neither success nor failure", () => {
    expect(parseCasResponse("<html>Bad gateway</html>").ok).toBe(false);
  });
});

describe("safeCallbackPath", () => {
  it("keeps same-origin paths", () => {
    expect(safeCallbackPath("/campaigns/new?template=x")).toBe("/campaigns/new?template=x");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "", null])(
    "rejects %s",
    (value) => {
      expect(safeCallbackPath(value)).toBeNull();
    }
  );
});

describe("CAS URLs", () => {
  it("defaults to ASU weblogin and the NEXTAUTH_URL callback", () => {
    const config = getCasConfig();
    expect(config.loginUrl).toBe("https://weblogin.asu.edu/cas/login");
    expect(config.validateUrl).toBe("https://weblogin.asu.edu/cas/serviceValidate");
    expect(config.serviceUrl).toBe(
      "https://openreply.example.asu.edu/api/auth/cas/callback"
    );
  });

  it("resolves relative overrides against CAS_BASE_URL", () => {
    process.env.CAS_BASE_URL = "https://cas.example.edu/cas/";
    process.env.CAS_VALIDATE_URL = "/p3/serviceValidate";
    expect(getCasConfig().validateUrl).toBe("https://cas.example.edu/cas/p3/serviceValidate");
  });

  it("carries the callback path inside the encoded service URL", () => {
    const config = getCasConfig();
    const login = new URL(buildLoginUrl(config, "/settings"));
    expect(login.searchParams.get("service")).toBe(buildServiceUrl(config, "/settings"));
    expect(new URL(login.searchParams.get("service")!).searchParams.get("callbackUrl")).toBe(
      "/settings"
    );
  });
});

describe("extractCasIdentity", () => {
  it("prefers released attributes and normalizes case", () => {
    process.env.CAS_ATTR_ASURITE = "uid";
    const identity = extractCasIdentity(getCasConfig(), "ignored", {
      uid: ["SDevil"],
      mail: ["Sparky.Devil@ASU.edu"],
      displayName: ["Sparky Devil"],
    });
    expect(identity).toMatchObject({
      asurite: "sdevil",
      email: "sparky.devil@asu.edu",
      name: "Sparky Devil",
    });
  });

  it("falls back to the CAS user and an @asu.edu address", () => {
    const identity = extractCasIdentity(getCasConfig(), "SDevil", {});
    expect(identity).toMatchObject({
      asurite: "sdevil",
      email: "sdevil@asu.edu",
      name: null,
    });
  });
});

describe("validateCasTicket", () => {
  it("validates against the same service URL used at login", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(SUCCESS_XML));
    vi.stubGlobal("fetch", fetchMock);
    const config = getCasConfig();

    const result = await validateCasTicket(config, "ST-123", "/settings");

    expect(result.ok).toBe(true);
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.searchParams.get("ticket")).toBe("ST-123");
    expect(url.searchParams.get("service")).toBe(buildServiceUrl(config, "/settings"));
  });

  it("reports HTTP errors without parsing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    expect(await validateCasTicket(getCasConfig(), "ST-1", null)).toEqual({
      ok: false,
      reason: "CAS validation returned HTTP 503",
    });
  });
});
