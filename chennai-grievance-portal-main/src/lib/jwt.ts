import { SignJWT, jwtVerify } from "jose";
import { JwtPayload } from "@/types";
import { jwtSecret } from "@/lib/secrets";

// jose works in both the Node.js runtime (API routes) and the Edge
// runtime (middleware.ts), unlike jsonwebtoken which depends on Node's
// crypto module. Using one library everywhere keeps token issuance and
// verification perfectly consistent across the app.

// read on first use (not at import), so a build without the secret still compiles; production refuses a weak one
let key: Uint8Array | null = null;
const secretKey = () => (key ??= new TextEncoder().encode(jwtSecret()));
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(secretKey());
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}
