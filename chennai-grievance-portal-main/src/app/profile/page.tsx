"use client";

import { useEffect, useState, FormEvent } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { AlertCircle, Camera, CheckCircle2, Loader2, Lock, PencilLine } from "lucide-react";
import Header from "@/components/Header";
import { Chip, OtpInput, ProgressRing, Skeleton, Tabs, Tip, Toaster, useToasts } from "@/components/ui";
import { EASE_OUT } from "@/components/ui/motion";
import { CITIZEN_NAV } from "@/lib/constants";
import Footer from "@/components/Footer";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";

interface Zone {
  id: number;
  zone_number: number;
  zone_name: string;
  ward_start: number;
  ward_end: number;
}

interface ProfileData {
  firstName: string | null;
  lastName: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  mobileNumber: string | null;
  mobileVerified: boolean;
  alternateEmail: string | null;
  doorNoAndStreet: string | null;
  area: string | null;
  locality: string | null;
  pincode: string | null;
  zoneId: number | null;
  zoneName: string | null;
  wardNumber: number | null;
  aadhaarMasked: string;
  profilePhoto: string | null;
}

interface UserInfo {
  id: number;
  email: string;
  role: "collector" | "department_officer" | "citizen";
  departmentName: string | null;
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [completeness, setCompleteness] = useState(0);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Edit form state
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    gender: "",
    dateOfBirth: "",
    alternateEmail: "",
    doorNoAndStreet: "",
    area: "",
    locality: "",
    pincode: "",
    zoneId: "",
    wardNumber: "",
    aadhaarNumber: ""
  });

  // Mobile OTP re-verification state
  const [mobileEditing, setMobileEditing] = useState(false);
  const [newMobile, setNewMobile] = useState("");
  const [mobileOtp, setMobileOtp] = useState("");
  const [mobileOtpSent, setMobileOtpSent] = useState(false);
  const [mobileDevOtp, setMobileDevOtp] = useState<string | null>(null);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [mobileSubmitting, setMobileSubmitting] = useState(false);

  // Change password state
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [pwSubmitting, setPwSubmitting] = useState(false);

  // Photo upload
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  /** the chosen photo, shown in the circle while it uploads */
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [tab, setTab] = useState<"account" | "personal" | "mobile" | "password">("account");
  const toasts = useToasts();
  // saves confirm with a toast as well as the inline message
  useEffect(() => { if (success) toasts.push(success); }, [success]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (pwSuccess) toasts.push(pwSuccess); }, [pwSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadProfile();
    fetch("/api/locations/zones")
      .then((r) => r.json())
      .then((d) => setZones(d.zones || []));
  }, []);

  async function loadProfile() {
    setLoading(true);
    const res = await fetch("/api/profile");
    if (res.ok) {
      const data = await res.json();
      setUser(data.user);
      setProfile(data.profile);
      setCompleteness(data.completeness);
      if (data.profile) {
        setForm({
          firstName: data.profile.firstName || "",
          lastName: data.profile.lastName || "",
          gender: data.profile.gender || "",
          dateOfBirth: data.profile.dateOfBirth ? String(data.profile.dateOfBirth).slice(0, 10) : "",
          alternateEmail: data.profile.alternateEmail || "",
          doorNoAndStreet: data.profile.doorNoAndStreet || "",
          area: data.profile.area || "",
          locality: data.profile.locality || "",
          pincode: data.profile.pincode || "",
          zoneId: data.profile.zoneId ? String(data.profile.zoneId) : "",
          wardNumber: data.profile.wardNumber ? String(data.profile.wardNumber) : "",
          aadhaarNumber: ""
        });
      }
    }
    setLoading(false);
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          gender: form.gender || null,
          dateOfBirth: form.dateOfBirth || null,
          alternateEmail: form.alternateEmail || null,
          doorNoAndStreet: form.doorNoAndStreet || null,
          area: form.area || null,
          locality: form.locality || null,
          pincode: form.pincode || null,
          zoneId: form.zoneId ? Number(form.zoneId) : null,
          wardNumber: form.wardNumber ? Number(form.wardNumber) : null,
          aadhaarNumber: form.aadhaarNumber || null
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save profile.");
        setSaving(false);
        return;
      }
      setSuccess("Profile updated successfully.");
      setEditing(false);
      await loadProfile();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function requestMobileOtp() {
    setMobileError(null);
    setMobileSubmitting(true);
    try {
      const res = await fetch("/api/profile/mobile-otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobileNumber: newMobile })
      });
      const data = await res.json();
      if (!res.ok) {
        setMobileError(data.error || "Failed to send OTP.");
        setMobileSubmitting(false);
        return;
      }
      setMobileOtpSent(true);
      if (data.devOtp) setMobileDevOtp(data.devOtp);
    } catch {
      setMobileError("Something went wrong. Please try again.");
    } finally {
      setMobileSubmitting(false);
    }
  }

  async function verifyMobileOtp() {
    setMobileError(null);
    setMobileSubmitting(true);
    try {
      const res = await fetch("/api/profile/mobile-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobileNumber: newMobile, otp: mobileOtp })
      });
      const data = await res.json();
      if (!res.ok) {
        setMobileError(data.error || "Failed to verify OTP.");
        setMobileSubmitting(false);
        return;
      }
      setMobileEditing(false);
      setMobileOtpSent(false);
      setNewMobile("");
      setMobileOtp("");
      setMobileDevOtp(null);
      await loadProfile();
    } catch {
      setMobileError("Something went wrong. Please try again.");
    } finally {
      setMobileSubmitting(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);

    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError("Passwords do not match.");
      return;
    }

    setPwSubmitting(true);
    try {
      const res = await fetch("/api/profile/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pwForm)
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error || "Failed to change password.");
        setPwSubmitting(false);
        return;
      }
      setPwSuccess("Password changed successfully.");
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch {
      setPwError("Something went wrong. Please try again.");
    } finally {
      setPwSubmitting(false);
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/profile/photo", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setPhotoError(data.error || "Failed to upload photo.");
        return;
      }
      await loadProfile();
    } catch {
      setPhotoError("Something went wrong. Please try again.");
    } finally {
      setPhotoUploading(false);
      setPhotoPreview(null);
    }
  }

  const selectedZone = zones.find((z) => String(z.id) === form.zoneId);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col diq-bg">
        <Header userName={user?.email} />
        <main className="mx-auto grid w-full max-w-[1100px] flex-1 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[300px_1fr]">
          <div className="card flex flex-col items-center gap-3"><Skeleton w={96} h={96} r={48} /><Skeleton h={16} w={140} /><Skeleton h={12} w={100} /></div>
          <div className="card space-y-4"><Skeleton h={30} w="70%" /><Skeleton h={14} /><Skeleton h={14} w="80%" /><Skeleton h={14} w="60%" /></div>
        </main>
        <Footer />
      </div>
    );
  }

  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || user?.email || "Your profile";
  const roleLabel = user?.role === "department_officer" ? "Department officer" : user?.role === "collector" ? "District Collector" : "Citizen";
  const TABS = [
    { value: "account" as const, label: "Account information" },
    { value: "personal" as const, label: "Personal details" },
    { value: "mobile" as const, label: "Mobile number" },
    { value: "password" as const, label: "Password" }
  ];
  const Note = ({ kind, children }: { kind: "err" | "ok"; children: React.ReactNode }) => (
    <motion.div role={kind === "err" ? "alert" : "status"} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className={`mb-4 ${kind === "err" ? "alert-error" : "alert-success"}`}>
      {kind === "err" ? <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />}
      <span>{children}</span>
    </motion.div>
  );

  return (
    <MotionConfig reducedMotion="user">
    <div className="flex min-h-screen flex-col diq-bg">
      <Header userName={user?.email || undefined} homeHref={user?.role === "citizen" ? "/citizen" : "/"} nav={user?.role === "citizen" ? CITIZEN_NAV : []} />
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-6 text-[28px] font-semibold tracking-[-0.03em] text-ink">My profile</h1>

        <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* ---- profile card ---- */}
          <motion.aside initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT }}
            className="card flex flex-col items-center p-6 text-center lg:sticky lg:top-[84px]">
            <label className="group relative cursor-pointer rounded-full focus-within:ring-4 focus-within:ring-navy-600/25" title="Change photo">
              <span className="relative block h-28 w-28">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview || profile?.profilePhoto || "/default-avatar.svg"} alt="Profile photo"
                  className="h-28 w-28 rounded-full border-2 border-canvas-border object-cover" />
                <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-[12px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
                  <Camera className="h-5 w-5" aria-hidden="true" />
                </span>
                {photoUploading && (
                  <span className="absolute -inset-1.5 grid place-items-center">
                    <svg className="h-full w-full animate-spin" viewBox="0 0 120 120" aria-hidden="true">
                      <circle cx="60" cy="60" r="56" fill="none" stroke="var(--line)" strokeWidth="4" />
                      <circle cx="60" cy="60" r="56" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray="90 300" />
                    </svg>
                  </span>
                )}
              </span>
              <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={handlePhotoChange} disabled={photoUploading} aria-label="Change photo" />
            </label>
            <p className="mt-2 text-xs font-semibold text-navy-600">{photoUploading ? "Uploading…" : "Change photo"}</p>
            {photoError && <p className="form-error justify-center text-center">{photoError}</p>}

            <h2 className="mt-4 text-[18px] font-semibold tracking-[-0.02em] text-ink">{name}</h2>
            <p className="mt-0.5 text-[13px] text-ink-subtle">{roleLabel}{user?.departmentName ? ` · ${user.departmentName}` : ""}</p>

            <div className="mt-5 flex w-full items-center gap-3 rounded-[12px] border border-canvas-border bg-canvas-sunken/60 p-3 text-left">
              <ProgressRing value={completeness / 100} size={46} stroke={4}>{completeness}%</ProgressRing>
              <div>
                <p className="text-[13px] font-semibold text-ink">Profile completeness</p>
                <p className="text-[12px] text-ink-subtle">{completeness >= 100 ? "Everything is filled in." : "Complete it so complaints prefill."}</p>
              </div>
            </div>
          </motion.aside>

          {/* ---- tabbed sections ---- */}
          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06, ease: EASE_OUT }} className="card min-w-0 p-0">
            <div className="overflow-x-auto px-4 pt-2">
              <Tabs label="Profile sections" items={TABS} value={tab} onChange={setTab} />
            </div>
            <div className="p-5 sm:p-6">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
                  {tab === "account" && (
                    <>
                      <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <Field label="Login email" value={user?.email} />
                        <Field label="Role" value={roleLabel} />
                        {user?.role === "department_officer" && <Field label="Department" value={user.departmentName} />}
                        {user?.role === "collector" && <Field label="Designation" value="District Collector, Chennai." />}
                      </dl>
                      <p className="mt-5 text-xs text-ink-subtle">Contact admin to change your role or email.</p>
                    </>
                  )}

                  {tab === "personal" && (
                    <>
                      {error && <Note kind="err">{error}</Note>}
                      {success && <Note kind="ok">{success}</Note>}
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-[15px] font-semibold text-ink">Personal details</h3>
                        {!editing && (
                          <button type="button" onClick={() => setEditing(true)} className="btn-secondary h-9"><PencilLine className="h-4 w-4" aria-hidden="true" />Edit profile</button>
                        )}
                      </div>

                      {!editing ? (
                        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                          <Field label="First name" value={profile?.firstName} />
                          <Field label="Last name" value={profile?.lastName} />
                          <Field label="Gender" value={profile?.gender} />
                          <Field label="Date of birth" value={profile?.dateOfBirth ? String(profile.dateOfBirth).slice(0, 10) : null} />
                          <Field label="Alternate email" value={profile?.alternateEmail} />
                          <Field label="Door no. & street" value={profile?.doorNoAndStreet} />
                          <Field label="Area" value={profile?.area} />
                          <Field label="Locality" value={profile?.locality} />
                          <Field label="Pincode" value={profile?.pincode} mono />
                          <Field label="Zone" value={profile?.zoneName} />
                          <Field label="Ward number" value={profile?.wardNumber ? String(profile.wardNumber) : null} mono />
                          <Aadhaar masked={profile?.aadhaarMasked || null} />
                        </dl>
                      ) : (
                        <form onSubmit={handleSaveProfile} noValidate>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                              <label className="form-label" htmlFor="firstName">First name</label>
                              <input id="firstName" required className="form-input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                            </div>
                            <div>
                              <label className="form-label" htmlFor="lastName">Last name</label>
                              <input id="lastName" className="form-input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                            </div>
                            <div>
                              <span className="form-label">Gender</span>
                              <div className="flex flex-wrap gap-2 pt-0.5" role="radiogroup" aria-label="Gender">
                                {["Male", "Female", "Transgender"].map((g) => (
                                  <label key={g} className={form.gender === g ? "chip-active cursor-pointer px-3 py-1.5" : "chip-idle cursor-pointer px-3 py-1.5"}>
                                    <input type="radio" name="gender" value={g} className="sr-only" checked={form.gender === g} onChange={(e) => setForm({ ...form, gender: e.target.value })} />
                                    {g}
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="form-label" htmlFor="dob">Date of birth</label>
                              <input id="dob" type="date" className="form-input" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
                            </div>
                            <div>
                              <label className="form-label" htmlFor="altEmail">Alternate email</label>
                              <input id="altEmail" type="email" className="form-input" value={form.alternateEmail} onChange={(e) => setForm({ ...form, alternateEmail: e.target.value })} />
                            </div>
                            <div>
                              <label className="form-label" htmlFor="pincode">Pincode</label>
                              <input id="pincode" maxLength={6} className="form-input font-mono" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, "") })} />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="form-label" htmlFor="doorStreet">Door no. &amp; street</label>
                              <input id="doorStreet" className="form-input" value={form.doorNoAndStreet} onChange={(e) => setForm({ ...form, doorNoAndStreet: e.target.value })} />
                            </div>
                            <div>
                              <label className="form-label" htmlFor="area">Area</label>
                              <input id="area" className="form-input" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
                            </div>
                            <div>
                              <label className="form-label" htmlFor="locality">Locality</label>
                              <input id="locality" className="form-input" value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })} />
                            </div>
                            <div>
                              <label className="form-label" htmlFor="zone">Zone</label>
                              <select id="zone" className="form-input" value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value, wardNumber: "" })}>
                                <option value="">Select zone</option>
                                {zones.map((z) => (<option key={z.id} value={z.id}>Zone {z.zone_number} &ndash; {z.zone_name}</option>))}
                              </select>
                            </div>
                            <div>
                              <label className="form-label" htmlFor="ward">Ward number {selectedZone && `(${selectedZone.ward_start}-${selectedZone.ward_end})`}</label>
                              <input id="ward" type="number" className="form-input font-mono" value={form.wardNumber} min={selectedZone?.ward_start} max={selectedZone?.ward_end}
                                onChange={(e) => setForm({ ...form, wardNumber: e.target.value })} />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="form-label" htmlFor="aadhaar">
                                <Lock className="mr-1 inline h-3 w-3" aria-hidden="true" />Aadhaar number {profile?.aadhaarMasked && `(current: ${profile.aadhaarMasked})`}
                              </label>
                              {/* typed digits are hidden like a password: the full number is never shown */}
                              <input id="aadhaar" type="password" autoComplete="off" maxLength={12} placeholder="12-digit Aadhaar (leave blank to keep unchanged)"
                                className="form-input font-mono" value={form.aadhaarNumber} onChange={(e) => setForm({ ...form, aadhaarNumber: e.target.value.replace(/\D/g, "") })} />
                              <p className="form-hint">Stored encrypted. Only the last four digits are ever shown.</p>
                            </div>
                          </div>
                          <div className="mt-6 flex gap-3">
                            <button type="submit" disabled={saving} className="btn-primary">{saving ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Saving…</> : "Save"}</button>
                            <button type="button" className="btn-secondary" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
                          </div>
                        </form>
                      )}
                    </>
                  )}

                  {tab === "mobile" && (
                    <>
                      {mobileError && <Note kind="err">{mobileError}</Note>}
                      {!mobileEditing ? (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">Mobile number</p>
                            <p className="mt-1 flex items-center gap-2 font-mono text-[17px] text-ink">
                              {profile?.mobileNumber || <span className="font-sans text-ink-faint">Not set</span>}
                              {profile?.mobileNumber && <Chip tone={profile.mobileVerified ? "ok" : "medium"} pill>{profile.mobileVerified ? "Verified" : "Not verified"}</Chip>}
                            </p>
                          </div>
                          <button type="button" className="btn-secondary h-9" onClick={() => setMobileEditing(true)}>Change</button>
                        </div>
                      ) : !mobileOtpSent ? (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                          <div className="flex-1">
                            <label className="form-label" htmlFor="newMobile">New mobile number</label>
                            <input id="newMobile" maxLength={10} inputMode="numeric" className="form-input font-mono" value={newMobile} onChange={(e) => setNewMobile(e.target.value.replace(/\D/g, ""))} />
                          </div>
                          <button type="button" disabled={mobileSubmitting} onClick={requestMobileOtp} className="btn-primary">{mobileSubmitting ? "Sending..." : "Send OTP"}</button>
                          <button type="button" className="btn-secondary" onClick={() => setMobileEditing(false)}>Cancel</button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {mobileDevOtp && <p className="rounded-[8px] bg-navy-50 p-2 font-mono text-sm font-bold text-navy-800">[Dev mode] Your OTP: {mobileDevOtp}</p>}
                          <div>
                            <span className="form-label">Enter the code sent to verify <span className="font-mono normal-case">{newMobile}</span></span>
                            <OtpInput value={mobileOtp} onChange={setMobileOtp} autoFocus label="Mobile OTP" />
                          </div>
                          <div className="flex gap-3">
                            <button type="button" disabled={mobileSubmitting} onClick={verifyMobileOtp} className="btn-primary">{mobileSubmitting ? "Verifying..." : "Verify & save"}</button>
                            <button type="button" className="btn-secondary" onClick={() => { setMobileEditing(false); setMobileOtpSent(false); }}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {tab === "password" && (
                    <>
                      {pwError && <Note kind="err">{pwError}</Note>}
                      {pwSuccess && <Note kind="ok">{pwSuccess}</Note>}
                      <form onSubmit={handleChangePassword} noValidate className="max-w-md">
                        <div className="mb-4">
                          <label className="form-label" htmlFor="currentPassword">Current password</label>
                          <input id="currentPassword" type="password" required className="form-input" value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} />
                        </div>
                        <div className="mb-4">
                          <label className="form-label" htmlFor="newPassword2">New password</label>
                          <input id="newPassword2" type="password" required className="form-input" value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} />
                          <PasswordStrengthMeter password={pwForm.newPassword} />
                        </div>
                        <div className="mb-6">
                          <label className="form-label" htmlFor="confirmNewPassword">Confirm new password</label>
                          <input id="confirmNewPassword" type="password" required className="form-input" value={pwForm.confirmPassword} onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })} />
                        </div>
                        <button type="submit" disabled={pwSubmitting} className="btn-primary">{pwSubmitting ? "Updating..." : "Change password"}</button>
                      </form>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.section>
        </div>
      </main>
      <Footer />
      <Toaster items={toasts.items} dismiss={toasts.dismiss} />
    </div>
    </MotionConfig>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">{label}</dt>
      <dd className={`mt-0.5 text-[14.5px] font-medium text-ink ${mono ? "font-mono" : ""}`}>{value || <span className="font-normal text-ink-faint">Not provided</span>}</dd>
    </div>
  );
}

/** Aadhaar is always shown masked (XXXX XXXX 1234), with a lock and an "Encrypted" tooltip; never the full number. */
function Aadhaar({ masked }: { masked: string | null }) {
  const last4 = masked ? masked.replace(/\D/g, "").slice(-4) : "";
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">Aadhaar number</dt>
      <dd className="mt-0.5 flex items-center gap-2 text-[14.5px] font-medium text-ink">
        {last4 ? <span className="font-mono tracking-wide">XXXX XXXX {last4}</span> : <span className="font-normal text-ink-faint">Not provided</span>}
        <Tip text="Encrypted. Only the last four digits are ever shown."><span tabIndex={0} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200"><Lock className="h-3 w-3" aria-hidden="true" />Encrypted</span></Tip>
      </dd>
    </div>
  );
}
