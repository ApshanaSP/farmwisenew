import { afterEach, describe, expect, it, vi } from "vitest";
import { WeakSecretError, encryptionSecret, jwtSecret, strongSecret } from "./secrets";

const LONG = "x".repeat(40);

afterEach(() => vi.unstubAllEnvs());

describe("server secrets (S-2)", () => {
  it("refuses a missing or short secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => strongSecret("JWT_SECRET", undefined, "fallback")).toThrow(WeakSecretError);
    expect(() => strongSecret("JWT_SECRET", "short", "fallback")).toThrow(/32 bytes/);
    expect(strongSecret("JWT_SECRET", LONG, "fallback")).toBe(LONG);
  });

  it("keeps the labelled fallback in development only", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(strongSecret("JWT_SECRET", undefined, "dev_only_x")).toBe("dev_only_x");
    // a short value someone set is still used in development (existing local data stays readable)
    expect(strongSecret("JWT_SECRET", "short", "dev_only_x")).toBe("short");
  });

  it("the token secret and the encryption secret read the environment", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", LONG);
    vi.stubEnv("AADHAAR_ENCRYPTION_KEY", "");
    expect(jwtSecret()).toBe(LONG);
    // existing rows were encrypted with JWT_SECRET when no own key was set
    expect(encryptionSecret()).toBe(LONG);
    vi.stubEnv("AADHAAR_ENCRYPTION_KEY", "k".repeat(32));
    expect(encryptionSecret()).toBe("k".repeat(32));
    vi.stubEnv("JWT_SECRET", "");
    expect(() => jwtSecret()).toThrow(WeakSecretError);
  });
});
