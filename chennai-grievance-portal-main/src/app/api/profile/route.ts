import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSessionFromCookies } from "@/lib/auth";
import { profileUpdateSchema } from "@/lib/validators";
import { RowDataPacket } from "mysql2";
import { maskAadhaar } from "@/lib/crypto";
import { mobileTry, onAnotherAccount } from "@/lib/profile-mobile";

const OPTIONAL_COMPLETENESS_FIELDS = [
  "last_name",
  "gender",
  "date_of_birth",
  "alternate_email",
  "door_no_and_street",
  "area",
  "locality",
  "pincode",
  "zone_id",
  "ward_number",
  "aadhaar_last4",
  "profile_photo"
];

function computeCompleteness(profile: Record<string, any> | null): number {
  if (!profile) return 0;
  const filled = OPTIONAL_COMPLETENESS_FIELDS.filter(
    (f) => profile[f] !== null && profile[f] !== undefined && profile[f] !== ""
  ).length;
  return Math.round((filled / OPTIONAL_COMPLETENESS_FIELDS.length) * 100);
}

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [userRows] = await pool.query<RowDataPacket[]>(
    `SELECT u.id, u.email, u.role, u.department_id, d.name AS department_name
     FROM users u LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.id = ?`,
    [session.userId]
  );
  if (userRows.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const user = userRows[0];

  const [profileRows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM user_profiles WHERE user_id = ?",
    [session.userId]
  );
  const profile = profileRows.length > 0 ? profileRows[0] : null;

  let zoneName: string | null = null;
  if (profile?.zone_id) {
    const [zoneRows] = await pool.query<RowDataPacket[]>(
      "SELECT zone_name FROM zones WHERE id = ?",
      [profile.zone_id]
    );
    zoneName = zoneRows[0]?.zone_name || null;
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      departmentName: user.department_name
    },
    profile: profile
      ? {
          firstName: profile.first_name,
          lastName: profile.last_name,
          gender: profile.gender,
          dateOfBirth: profile.date_of_birth,
          mobileNumber: profile.mobile_number,
          // no number is shown as verified: every stored TRUE came from the e-mailed code, which never reached the phone (QA pass 6,
          // hunt2-sec-03; lib/profile-mobile.ts). Read the column again once a code is sent to the phone itself.
          mobileVerified: false,
          alternateEmail: profile.alternate_email,
          doorNoAndStreet: profile.door_no_and_street,
          area: profile.area,
          locality: profile.locality,
          pincode: profile.pincode,
          zoneId: profile.zone_id,
          zoneName,
          wardNumber: profile.ward_number,
          aadhaarMasked: maskAadhaar(profile.aadhaar_last4),
          profilePhoto: profile.profile_photo
        }
      : null,
    completeness: computeCompleteness(profile)
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null); // a malformed body is a 400 from the schema, not a 500
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const data = parsed.data;

  // A ward must be one of the selected zone's own wards. zone_wards holds one row per GCC ward, taken from the ward boundaries,
  // so it is exact: a zone's ward numbers are not always one run (zone 14's range wraps around Adyar's ward 175), which a
  // start-to-end check lets through (RC-38, PB-200).
  if (data.zoneId && data.wardNumber) {
    const [zoneRows] = await pool.query<RowDataPacket[]>("SELECT id FROM zones WHERE id = ?", [data.zoneId]);
    if (zoneRows.length === 0) {
      return NextResponse.json({ error: "Invalid zone selected." }, { status: 400 });
    }
    const [wardRows] = await pool.query<RowDataPacket[]>(
      "SELECT 1 FROM zone_wards WHERE zone_id = ? AND ward_number = ? LIMIT 1",
      [data.zoneId, data.wardNumber]
    );
    if (wardRows.length === 0) {
      return NextResponse.json({ error: `Ward ${data.wardNumber} is not a ward of the selected zone.` }, { status: 400 });
    }
  }

  const [existing] = await pool.query<RowDataPacket[]>(
    "SELECT id, mobile_number FROM user_profiles WHERE user_id = ?",
    [session.userId]
  );

  // a mobile number is saved here only when the profile has none (the complaint form remembers the one typed there); changing it is the
  // mobile tab's, with the e-mailed code. A number on another account is not saved and not reported: a 500 from the unique column, or a
  // refusal, told any signed-in citizen whether a number is registered (QA pass 6, hunt2-sec-02). Trying one counts on the same per-account
  // budget as asking for a code (lib/profile-mobile.ts).
  let mobile: string | null = null;
  if (data.mobileNumber && !existing[0]?.mobile_number && mobileTry(session.userId).allowed && !(await onAnotherAccount(session.userId, data.mobileNumber))) {
    mobile = data.mobileNumber;
  }

  const fields = {
    first_name: data.firstName,
    last_name: data.lastName || null,
    gender: data.gender || null,
    date_of_birth: data.dateOfBirth || null,
    alternate_email: data.alternateEmail || null,
    door_no_and_street: data.doorNoAndStreet || null,
    area: data.area || null,
    locality: data.locality || null,
    pincode: data.pincode || null,
    zone_id: data.zoneId || null,
    ward_number: data.wardNumber || null
  };

  if (existing.length === 0) {
    await pool.query(
      `INSERT INTO user_profiles
        (user_id, first_name, last_name, gender, date_of_birth, alternate_email,
         door_no_and_street, area, locality, pincode, zone_id, ward_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.userId,
        fields.first_name,
        fields.last_name,
        fields.gender,
        fields.date_of_birth,
        fields.alternate_email,
        fields.door_no_and_street,
        fields.area,
        fields.locality,
        fields.pincode,
        fields.zone_id,
        fields.ward_number
      ]
    );
  } else {
    await pool.query(
      `UPDATE user_profiles SET
        first_name = ?, last_name = ?, gender = ?, date_of_birth = ?, alternate_email = ?,
        door_no_and_street = ?, area = ?, locality = ?, pincode = ?, zone_id = ?, ward_number = ?
       WHERE user_id = ?`,
      [
        fields.first_name,
        fields.last_name,
        fields.gender,
        fields.date_of_birth,
        fields.alternate_email,
        fields.door_no_and_street,
        fields.area,
        fields.locality,
        fields.pincode,
        fields.zone_id,
        fields.ward_number,
        session.userId
      ]
    );
  }

  // the number on its own, never verified, and only into an empty slot; another account taking it in between is not an error either
  if (mobile) {
    await pool.query("UPDATE user_profiles SET mobile_number = ?, mobile_verified = FALSE WHERE user_id = ? AND mobile_number IS NULL", [mobile, session.userId])
      .catch((err: { code?: string; message?: string }) => { if (!/ER_DUP_ENTRY|UNIQUE constraint/i.test(`${err?.code ?? ""} ${err?.message ?? ""}`)) throw err; });
  }

  // Aadhaar is handled separately below (encrypted at rest) so a blank
  // submission doesn't wipe out a previously saved number.
  if (data.aadhaarNumber) {
    const { encryptAadhaar } = await import("@/lib/crypto");
    const encrypted = encryptAadhaar(data.aadhaarNumber);
    const last4 = data.aadhaarNumber.slice(-4);
    await pool.query(
      "UPDATE user_profiles SET aadhaar_number_encrypted = ?, aadhaar_last4 = ? WHERE user_id = ?",
      [encrypted, last4, session.userId]
    );
  }

  return NextResponse.json({ message: "Profile updated successfully." });
}
