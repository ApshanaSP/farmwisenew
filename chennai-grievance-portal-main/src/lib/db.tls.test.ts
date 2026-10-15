import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/aws/store", () => ({ awsPool: () => ({}) }));
const { tlsFor } = await import("./db");

afterEach(() => vi.unstubAllEnvs());

describe("database TLS (S-6)", () => {
  it("checks the server certificate by default", () => {
    vi.stubEnv("DB_SSL_INSECURE", "");
    vi.stubEnv("DB_SSL_CA", "");
    expect(tlsFor(new URL("mysql://u:p@h:3306/db"))).toEqual({ rejectUnauthorized: true });
  });
  it("turns the check off only when explicitly asked", () => {
    vi.stubEnv("DB_SSL_INSECURE", "true");
    expect(tlsFor(new URL("mysql://u:p@h:3306/db"))).toEqual({ rejectUnauthorized: false });
  });
  it("uses a provider CA given as PEM text", () => {
    vi.stubEnv("DB_SSL_INSECURE", "");
    vi.stubEnv("DB_SSL_CA", "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----");
    expect(tlsFor(new URL("mysql://u:p@h/db"))?.ca).toContain("BEGIN CERTIFICATE");
  });
  it("no TLS when the URL says ssl=false", () => {
    expect(tlsFor(new URL("mysql://u:p@h/db?ssl=false"))).toBeUndefined();
  });
});
