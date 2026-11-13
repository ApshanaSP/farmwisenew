/**
 * The mobile number on a citizen's profile. Nothing in this app proves that a person holds a phone: the code of the "verify mobile" step
 * was e-mailed to the account, never sent to the number, so the profile called any number "Verified" (QA pass 6, hunt2-sec-03). Until a
 * code goes to the phone itself (an SMS: the owner's decision, see the pass 7 note), the e-mailed code only confirms that the account's
 * holder is the one changing the number, and a saved number is never called verified.
 *
 * Whether a number is on another account was answered at once, to anyone signed in, one number after another (hunt2-sec-02). It is now
 * answered only after the e-mailed code, and every way of saving a number counts on one budget per account.
 */
import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { checkRateLimit, type RateLimitResult } from "@/lib/rate-limit";

/** codes asked for and numbers tried, per account and hour, whichever route */
export const MOBILE_TRIES_PER_HOUR = 5;
export const mobileTry = (userId: number): RateLimitResult => checkRateLimit(`mobile-claim:${userId}`, MOBILE_TRIES_PER_HOUR, 3600);

/** The code is the account's for this number: another account asking for the same number neither replaces it nor waits for it. */
export const mobileOtpId = (userId: number, mobile: string): string => `mobile:${userId}:${mobile}`;

/** Is the number on another account's profile? (user_profiles.mobile_number is unique) */
export async function onAnotherAccount(userId: number, mobile: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT 1 AS x FROM user_profiles WHERE mobile_number = ? AND user_id <> ? LIMIT 1", [mobile, userId]);
  return rows.length > 0;
}

export const tryAgainIn = (r: RateLimitResult): string => `Too many tries. Try again in ${Math.max(1, Math.ceil((r.retryAfterSeconds ?? 3600) / 60))} minutes.`;
