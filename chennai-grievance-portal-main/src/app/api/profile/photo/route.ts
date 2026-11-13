import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSessionFromCookies } from "@/lib/auth";
import { RowDataPacket } from "mysql2";
import { sniff } from "@/lib/officer/photos";
import { removePhoto, savePhoto } from "@/lib/profile-photo";
import { readFormCapped, tooLargeResponse } from "@/lib/body-cap";

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png"];

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // read with a byte limit before it is parsed: the request's own form reader took a body of any size into memory first, and the 2 MB check came after,
  // so a body with no Content-Length was pulled whole (pass 6's reviewerA-02). The limit is the largest valid upload plus the form's framing.
  const { form: formData, tooLarge } = await readFormCapped(req, MAX_SIZE_BYTES + 64 * 1024);
  if (tooLarge) return tooLargeResponse();
  if (!formData) return NextResponse.json({ error: "No file uploaded." }, { status: 400 }); // not multipart: a 400, not a 500
  const file = formData.get("photo") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only JPG and PNG images are allowed." }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File must be 2MB or smaller." }, { status: 400 });
  }

  // the file's own bytes decide what it is (the browser's type is only what the file name says): a page or a script renamed .png is
  // refused before anything is written
  const buffer = Buffer.from(await file.arrayBuffer());
  const kind = sniff(buffer);
  if (kind !== "jpg" && kind !== "png") {
    return NextResponse.json({ error: "Only JPG and PNG images are allowed." }, { status: 400 });
  }

  // kept outside public/ under a random name, and served to its owner only (lib/profile-photo.ts; QA pass 6, hunt2-sec-07)
  const photoPath = await savePhoto(buffer, kind);

  const [existing] = await pool.query<RowDataPacket[]>(
    "SELECT id, profile_photo FROM user_profiles WHERE user_id = ?",
    [session.userId]
  );
  if (existing.length === 0) {
    await pool.query(
      "INSERT INTO user_profiles (user_id, profile_photo) VALUES (?, ?)",
      [session.userId, photoPath]
    );
  } else {
    await pool.query("UPDATE user_profiles SET profile_photo = ? WHERE user_id = ?", [
      photoPath,
      session.userId
    ]);
    await removePhoto(existing[0].profile_photo, session.userId);
  }

  return NextResponse.json({ message: "Photo updated.", profilePhoto: photoPath });
}
