import { z } from "zod";
import { isComplaintMediaPath } from "@/lib/complaint-media-path";

// ---------------------------------------------------------------------
// Required text: at least one character a reader can see
// ---------------------------------------------------------------------
// trim() keeps the format characters that print nothing (zero-width space and joiners, word joiner, BOM, direction marks, soft
// hyphen, tags), the variation selectors, the combining grapheme joiner and the blank letters (Hangul fillers, Braille blank), so a
// field of only "​" passed min(1) and filed a blank complaint (hunt2-desk-17). The value is kept as typed: a joiner inside a
// Tamil word is part of the word. Only the "is anything there" check ignores them.
const INVISIBLE = /[\p{Cf}͏ᅟᅠ⠀ㅤ︀-️ﾠ\u{E0100}-\u{E01EF}]|\s/gu;

/** The text with every invisible character and every space removed: what a reader would actually see. */
export function visibleText(value: string | null | undefined): string {
  return String(value ?? "").replace(INVISIBLE, "");
}

/** True when the text has at least `min` characters a reader can see. */
export function hasVisibleText(value: string | null | undefined, min = 1): boolean {
  return Array.from(visibleText(value)).length >= min;
}

/** A required text field: trimmed, at most `max` characters, and at least `min` visible characters. The shared rule for every form. */
export function requiredText(message: string, max: number, min = 1) {
  return z.string({ required_error: message }).trim().min(1, message).max(max).refine((v) => hasVisibleText(v, min), message);
}

// ---------------------------------------------------------------------
// Password: min 8 chars, 1 upper, 1 lower, 1 number, 1 special, no spaces
// ---------------------------------------------------------------------
export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .refine((v) => !/\s/.test(v), "No spaces allowed")
  .refine((v) => /[A-Z]/.test(v), "At least one uppercase letter")
  .refine((v) => /[a-z]/.test(v), "At least one lowercase letter")
  .refine((v) => /[0-9]/.test(v), "At least one number")
  .refine((v) => /[^A-Za-z0-9]/.test(v), "At least one special character");

export interface PasswordRuleCheck {
  label: string;
  passed: boolean;
}

export function checkPasswordRules(password: string): PasswordRuleCheck[] {
  return [
    { label: "At least 8 characters", passed: password.length >= 8 },
    { label: "One uppercase letter", passed: /[A-Z]/.test(password) },
    { label: "One lowercase letter", passed: /[a-z]/.test(password) },
    { label: "One number", passed: /[0-9]/.test(password) },
    { label: "One special character", passed: /[^A-Za-z0-9]/.test(password) },
    { label: "No spaces", passed: password.length > 0 && !/\s/.test(password) }
  ];
}

export function passwordStrengthScore(password: string): number {
  const rules = checkPasswordRules(password);
  const passed = rules.filter((r) => r.passed).length;
  return Math.round((passed / rules.length) * 100);
}

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

export const mobileSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");

export const pincodeSchema = z.string().trim().regex(/^\d{6}$/, "Enter a valid 6-digit pincode");

export const otpSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit OTP");

export const aadhaarSchema = z
  .string()
  .trim()
  .regex(/^\d{12}$/, "Enter a valid 12-digit Aadhaar number");

// ---------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------
export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    // Captured once here so the complaint form never has to ask again.
    firstName: requiredText("First name is required", 100),
    lastName: z.string().trim().max(100).optional().default("")
    // No role or department here: self-registration is for citizens only.
    // Collector and officer accounts are issued by the Collector's office
    // (scripts/seed-users.js, scripts/seed-officers.js). Any role sent in
    // the body is stripped by zod and never reaches the database.
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required")
});

export const forgotPasswordRequestSchema = z.object({
  email: emailSchema
});

export const forgotPasswordVerifySchema = z.object({
  email: emailSchema,
  otp: otpSchema
});

export const forgotPasswordResetSchema = z
  .object({
    email: emailSchema,
    otp: otpSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string()
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
  });

// ---------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------
export const profileUpdateSchema = z.object({
  firstName: requiredText("First name is required", 100),
  lastName: z.string().trim().max(100).optional().default(""),
  gender: z.enum(["Male", "Female", "Transgender"]).optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  alternateEmail: z.union([emailSchema, z.literal("")]).optional().nullable(),
  mobileNumber: z.union([mobileSchema, z.literal("")]).optional().nullable(),
  doorNoAndStreet: z.string().trim().max(255).optional().nullable(),
  area: z.string().trim().max(150).optional().nullable(),
  locality: z.string().trim().max(150).optional().nullable(),
  pincode: z.union([pincodeSchema, z.literal("")]).optional().nullable(),
  zoneId: z.number().int().positive().optional().nullable(),
  wardNumber: z.number().int().positive().optional().nullable(),
  aadhaarNumber: z.union([aadhaarSchema, z.literal("")]).optional().nullable()
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
    confirmPassword: z.string()
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
  });

// ---------------------------------------------------------------------
// Complaint
// ---------------------------------------------------------------------
export const complaintSubmitSchema = z
  .object({
    // --- complainant's own details -------------------------------------
    initials: z.string().trim().max(10).optional().default(""),
    firstName: requiredText("First name is required", 100),
    lastName: z.string().trim().max(100).optional().default(""),
    gender: z.enum(["Male", "Female", "Transgender"]),
    streetAddress: requiredText("Your address is required", 255),
    // Mandatory: the department needs a way to reach the complainant.
    mobileNumber: mobileSchema,
    pincode: z.union([pincodeSchema, z.literal("")]).optional().nullable(),
    phoneNumber: z.string().trim().max(15).optional().nullable(),
    email: z.union([emailSchema, z.literal("")]).optional().nullable(),

    // --- where the problem is (verified GCC reference data) -------------
    zoneId: z.number().int().positive("Please select the zone"),
    // Derived server-side from the chosen street rather than picked: every
    // street already belongs to exactly one locality. Null for a manually
    // typed street, whose locality is genuinely unknown.
    gccLocalityId: z.number().int().positive().nullable().optional(),
    gccStreetId: z.number().int().positive().nullable().optional(),
    manualStreetName: z.string().trim().max(255).nullable().optional(),
    streetType: z.string().trim().max(60).nullable().optional(),

    wardNumber: z.number().int().min(1).max(200),
    wardSource: z.enum(["map_boundary", "user_selected"]).optional().default("user_selected"),
    locationPincode: z.union([pincodeSchema, z.literal("")]).nullable().optional(),

    specificLocation: z.string().trim().max(500).optional().nullable(),
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),

    // --- what the problem is -------------------------------------------
    complaintSubtypeId: z.number().int().positive("Please select a complaint sub type"),
    // Free text for the "Other" type; the classifier routes it to a department.
    otherDescription: z.string().trim().max(400).nullable().optional(),

    title: requiredText("Title is required", 200),
    description: requiredText("Details are required", 400),
    // only a path the upload route returned: a private upload, or an older public one; never a URL or a file path
    mediaPath: z.string().trim().max(200)
      .refine((p) => p === "" || isComplaintMediaPath(p), "The attached file was not recognised. Please attach it again.")
      .optional().nullable(),
    isAnonymous: z.boolean().optional().default(false)
  })
  .refine(
    (d) => Boolean(d.gccStreetId) || hasVisibleText(d.manualStreetName),
    {
      message: "Select a street from the list, or enter one manually",
      path: ["gccStreetId"]
    }
  )
  .refine((d) => !(d.gccStreetId && d.manualStreetName), {
    // Exactly one of the two, so the stored street is never ambiguous.
    message: "Provide either a listed street or a manually entered one, not both",
    path: ["manualStreetName"]
  });
