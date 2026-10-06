"use client";

import { useCallback, useEffect, useRef, useState, FormEvent } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  Copy,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  FileText,
  ImagePlus,
  Loader2,
  MapPin,
  Info,
  PencilLine,
  ShieldAlert,
  UserRound,
  X
} from "lucide-react";
import Header from "@/components/Header";
import { CITIZEN_NAV } from "@/lib/constants";
import Footer from "@/components/Footer";
import Combobox from "@/components/Combobox";
import ComplaintTypeSelector, {
  ComplaintCategory,
  Subcomplaint,
  TaxonomySource
} from "@/components/ComplaintTypeSelector";
import type { LocationSelection } from "@/components/MapPicker";
import { Confetti, Dropzone, RollingText, Skeleton, Stepper, SuccessCheck, Timeline } from "@/components/ui";
import { EASE_OUT, spring } from "@/components/ui/motion";

const MapPicker = dynamic(() => import("@/components/MapPicker"), { ssr: false });

interface Zone {
  id: number;
  zone_number: number;
  zone_name: string;
  ward_start: number;
  ward_end: number;
}
interface Locality {
  id: number;
  zone_id: number;
  name: string;
}
interface Street {
  id: number;
  locality_id: number;
  name: string;
}
interface ZoneOption {
  id: number;
  zone_number: number;
  zone_name: string;
}
interface WardOption {
  wardNumber: number;
  zoneId: number;
  zoneNumber: number;
  zoneName: string;
  label: string;
  /** The single likeliest ward for the area, from the derived mapping. */
  isPrimary: boolean;
}

/** Outcome of resolving the map pin against GCC ward polygons. */
type WardVerdict =
  | { status: "idle" }
  | { status: "checking" }
  | {
      status: "resolved";
      wardNumber: number;
      zoneId: number | null;
      zoneName: string | null;
      ambiguous: boolean;
      candidateWards: number[] | null;
      provenance: { sourceLabel: string | null; official: boolean; fetchedAt: string | null };
    }
  | { status: "outside_boundary"; message: string }
  | { status: "unavailable"; message: string };

/**
 * GCC's own form offers these street types. Kept separate from the street
 * name so "Anna" + "Salai" is not stored as one opaque string.
 */
const STREET_TYPES = [
  "Street", "Road", "Main Road", "Cross Street", "Avenue", "Lane",
  "Salai", "Nagar", "Colony", "Extension", "High Road", "Bazaar", "Other"
];

const STEPS = [
  { label: "Your Details", icon: UserRound },
  { label: "Location", icon: MapPin },
  { label: "Type", icon: Building2 },
  { label: "Details", icon: FileText }
];

export default function FileComplaintPage() {
  const [me, setMe] = useState<any>(null);
  const [checkedSession, setCheckedSession] = useState(false);
  /**
   * Details the profile is missing that a complaint needs; asked once, then
   * saved. Starts as "all missing" so that a profile which fails to load shows
   * the input fields rather than an empty, un-fillable summary.
   */
  const [missingDetails, setMissingDetails] = useState<string[]>([
    "firstName",
    "gender",
    "streetAddress",
    "mobileNumber"
  ]);
  const [savingProfile, setSavingProfile] = useState(false);

  const [step, setStep] = useState(1);
  /** direction of travel between steps, so the new step slides in from that side */
  const [dir, setDir] = useState(1);
  const [copiedCode, setCopiedCode] = useState(false);

  // Step 1: personal details
  const [initials, setInitials] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [personEmail, setPersonEmail] = useState("");

  // Step 2: location (verified GCC Area -> Locality -> Street)
  const [zones, setZones] = useState<ZoneOption[]>([]);


  const [zoneId, setZoneId] = useState("");

  // Street is always entered manually; the GCC street list is no longer used.
  const manualStreetMode = true;
  const [manualStreetName, setManualStreetName] = useState("");
  const [streetType, setStreetType] = useState("");
  const [locationPincode, setLocationPincode] = useState("");
  const [specificLocation, setSpecificLocation] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Ward: resolved from the map pin where possible, otherwise chosen.
  const [wards, setWards] = useState<WardOption[]>([]);
  const [wardsFiltered, setWardsFiltered] = useState(false);
  const [wardConfidence, setWardConfidence] = useState<"verified" | "derived" | null>(null);
  const [suggestedWard, setSuggestedWard] = useState<number | null>(null);
  const [wardNotice, setWardNotice] = useState<string | null>(null);
  const [wardNumber, setWardNumber] = useState("");
  const [wardSource, setWardSource] = useState<"map_boundary" | "user_selected" | "">("");
  const [wardVerdict, setWardVerdict] = useState<WardVerdict>({ status: "idle" });

  /**
   * Address fields the citizen typed into themselves. Map autofill skips them
   * until the citizen explicitly picks a different location, at which point
   * the new address wins and this resets.
   */
  const editedFields = useRef<Set<string>>(new Set());
  /** Guards against a slow ward lookup landing after a newer pin was placed. */
  const wardSeq = useRef(0);
  /** Which fields the map filled in, so the form can say so. */
  const [autofilled, setAutofilled] = useState<Set<string>>(new Set());

  // Step 3: GCC complaint category / subcomplaint
  const [categories, setCategories] = useState<ComplaintCategory[]>([]);
  const [taxonomySource, setTaxonomySource] = useState<TaxonomySource | null>(null);
  const [taxonomyLoading, setTaxonomyLoading] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<Subcomplaint | null>(null);
  const [otherDescription, setOtherDescription] = useState("");
  /** Set once the citizen edits the title, so retyping the type stops overwriting it. */
  const [titleEdited, setTitleEdited] = useState(false);

  // Step 4: details
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  /** a thumbnail of the chosen photo */
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!mediaFile || !mediaFile.type.startsWith("image/")) { setMediaPreview(null); return; }
    const u = URL.createObjectURL(mediaFile);
    setMediaPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [mediaFile]);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ complaintCode: string; department: string; complaintType: string } | null>(null);

  const selectedWard = wards.find((w) => String(w.wardNumber) === wardNumber) || null;

  useEffect(() => {
    async function init() {
      const meRes = await fetch("/api/auth/me");
      if (meRes.ok) {
        const meData = await meRes.json();
        setMe(meData.user);
        setPersonEmail(meData.user.email);

        const profileRes = await fetch("/api/profile");
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          const profile = profileData.profile;
          if (profile) {
            setFirstName(profile.firstName || "");
            setLastName(profile.lastName || "");
            setGender(profile.gender || "");
            setPincode(profile.pincode || "");
            setStreetAddress(profile.doorNoAndStreet || "");
            setMobileNumber(profile.mobileNumber || "");

            // A complaint needs these four. Anything already on the profile is
            // never asked for again.
            const missing: string[] = [];
            if (!profile.firstName) missing.push("firstName");
            if (!profile.gender) missing.push("gender");
            if (!profile.doorNoAndStreet) missing.push("streetAddress");
            if (!profile.mobileNumber) missing.push("mobileNumber");
            setMissingDetails(missing);
          } else {
            setMissingDetails(["firstName", "gender", "streetAddress", "mobileNumber"]);
            // Deliberately NOT prefilling the complaint's area/ward/street from
            // the profile: those describe where the citizen lives, and the
            // complaint location is a separate fact they must state for the
            // issue being reported.
          }
        }
      }
      setCheckedSession(true);
    }
    init();

    fetch("/api/locations/zones")
      .then((r) => r.json())
      .then((d) => setZones(d.zones || []))
      .catch(() => setZones([]));

    fetch("/api/complaint-taxonomy")
      .then((r) => r.json())
      .then((d) => {
        setCategories(d.categories || []);
        setTaxonomySource(d.source || null);
      })
      .catch(() => {
        setCategories([]);
      })
      .finally(() => setTaxonomyLoading(false));
  }, []);



  /**
   * Wards of the selected zone. zone_wards is an exact mapping derived from the
   * ward polygons themselves, so unlike the old area-based filter this list is
   * not an estimate.
   */
  useEffect(() => {
    let stale = false;
    fetch(`/api/locations/wards${zoneId ? "?zoneId=" + zoneId : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (stale) return;
        setWards(d.wards || []);
        setWardsFiltered(Boolean(d.filtered));
        setWardConfidence(d.confidence ?? null);
        setWardNotice(d.notice || null);
        setSuggestedWard(d.suggestedWard ?? null);
      })
      .catch(() => {
        if (!stale) setWards([]);
      });
    return () => {
      stale = true;
    };
  }, [zoneId]);



  /** Marks a field as citizen-edited so map autofill leaves it alone. */
  function markEdited(field: string) {
    editedFields.current.add(field);
  }

  /**
   * Applies a map selection.
   *
   * The pin coordinates are stored exactly as chosen — a reverse-geocode
   * result only contributes address TEXT, never position. An explicit new
   * selection is allowed to replace previously autofilled address text and
   * clears the manual-edit marks, which is what "until the user explicitly
   * selects a different location" means; the `initial` selection that merely
   * centres the map on Chennai does neither.
   */
  const handleMapSelection = useCallback(
    (sel: LocationSelection) => {
      setCoords(sel.coords);

      const explicit = sel.via !== "initial";
      if (explicit && sel.address) {
        editedFields.current.clear();
        const filled = new Set<string>();
        const { street, pincode } = sel.address;

        if (street) filled.add("street");
        if (pincode && /^\d{6}$/.test(pincode)) filled.add("pincode");
        setAutofilled(filled);
        // Only the complaint-location fields are touched. The complainant's own
        // address and PIN code in step 1 are never overwritten from the map.
        if (street && !editedFields.current.has("manualStreetName")) {
          setManualStreetName(street);
        }
        if (pincode && /^\d{6}$/.test(pincode)) {
          setLocationPincode(pincode);
        }
        if (sel.address.formatted && !editedFields.current.has("specificLocation")) {
          setSpecificLocation((prev) => prev || sel.address!.formatted!);
        }
      }

      if (!explicit) return;

      // Resolve the ward from the pin. Each lookup carries a sequence number so
      // a slow reply for an older pin cannot overwrite a newer verdict.
      const seq = ++wardSeq.current;
      setWardVerdict({ status: "checking" });
      fetch(`/api/locations/resolve-ward?lat=${sel.coords.lat}&lng=${sel.coords.lng}`)
        .then((r) => r.json())
        .then((d) => {
          if (seq !== wardSeq.current) return;
          if (d.status === "resolved") {
            // The pin gives the zone exactly, via the ward polygon it fell in.
            if (d.zoneId) {
              setZoneId(String(d.zoneId));
              setAutofilled((prev) => new Set([...prev, "zone"]));
            }
            setWardVerdict({
              status: "resolved",
              wardNumber: d.wardNumber,
              zoneId: d.zoneId ?? null,
              zoneName: d.zoneName ?? null,
              ambiguous: Boolean(d.ambiguous),
              candidateWards: d.candidateWards ?? null,
              provenance: {
                sourceLabel: d.provenance?.sourceLabel ?? null,
                official: Boolean(d.provenance?.official),
                fetchedAt: d.provenance?.fetchedAt ?? null
              }
            });
            // Autofill only when the boundary data gave a single answer.
            if (!d.ambiguous) {
              setWardNumber(String(d.wardNumber));
              setWardSource("map_boundary");
            }
          } else if (d.status === "outside_boundary") {
            setWardVerdict({ status: "outside_boundary", message: d.message });
            setWardNumber("");
            setWardSource("");
          } else {
            setWardVerdict({ status: "unavailable", message: d.message });
          }
        })
        .catch(() => {
          if (seq !== wardSeq.current) return;
          setWardVerdict({
            status: "unavailable",
            message:
              "The ward could not be checked just now. Please choose the ward yourself."
          });
        });
    },
    []
  );

  /**
   * Persists details the citizen had to supply here, so the next complaint
   * prefills them instead of asking again.
   */
  async function saveDetailsToProfile(): Promise<boolean> {
    if (missingDetails.length === 0) return true;
    setSavingProfile(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          gender: gender || null,
          doorNoAndStreet: streetAddress || null,
          pincode: pincode || null,
          mobileNumber: mobileNumber || null
        })
      });
      if (res.ok) setMissingDetails([]);
      // A failed save is not worth blocking the complaint over — the details
      // are still submitted with it, they just were not remembered.
      return true;
    } catch {
      return true;
    } finally {
      setSavingProfile(false);
    }
  }

  function goToStep(n: number) {
    setSubmitError(null);
    setDir(n >= step ? 1 : -1);
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateDetails(): string | null {
    if (!firstName.trim()) return "First name is required.";
    if (!gender) return "Please select a gender.";
    if (!streetAddress.trim()) return "Your address is required.";
    if (!/^[6-9]\d{9}$/.test(mobileNumber)) {
      return "Enter a valid 10-digit mobile number.";
    }
    if (pincode && !/^\d{6}$/.test(pincode)) {
      return "Enter a valid 6-digit PIN code, or leave it blank.";
    }
    return null;
  }

  function validateLocation(): string | null {
    if (!zoneId) return "Please select the zone.";
    if (!manualStreetName.trim()) return "Please enter the street name.";
    if (wardVerdict.status === "outside_boundary") {
      return wardVerdict.message;
    }
    if (!wardNumber) {
      return wardVerdict.status === "checking"
        ? "Still checking which ward the pin falls in — one moment."
        : "Please select the ward, or place a pin on the map to determine it.";
    }
    if (locationPincode && !/^\d{6}$/.test(locationPincode)) {
      return "Enter a valid 6-digit PIN code for the location, or leave it blank.";
    }
    return null;
  }

  function validateType(): string | null {
    if (!selectedCategoryId) return "Please select a complaint type.";
    if (!selectedSubtype) return "Please select a complaint sub type.";
    const cat = categories.find((c) => c.id === selectedCategoryId);
    if (cat && cat.name.trim().toLowerCase() === "other" && !otherDescription.trim()) {
      return "Please describe the complaint so it can be routed to a department.";
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!title.trim()) {
      setSubmitError("Complaint title is required.");
      return;
    }
    if (!description.trim()) {
      setSubmitError("Complaint details are required.");
      return;
    }

    setSubmitting(true);
    try {
      let mediaPath: string | undefined;
      if (mediaFile) {
        const formData = new FormData();
        formData.append("media", mediaFile);
        const mediaRes = await fetch("/api/complaints/media", { method: "POST", body: formData });
        const mediaData = await mediaRes.json();
        if (!mediaRes.ok) {
          setSubmitError(mediaData.error || "Failed to upload attachment.");
          setSubmitting(false);
          return;
        }
        mediaPath = mediaData.mediaPath;
      }

      const res = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initials,
          firstName,
          lastName,
          gender,
          streetAddress,
          pincode,
          mobileNumber: mobileNumber || null,
          phoneNumber: phoneNumber || null,
          email: personEmail || null,
          zoneId: Number(zoneId),
          gccStreetId: null,
          manualStreetName: manualStreetName.trim(),
          streetType: streetType || null,
          wardNumber: Number(wardNumber),
          wardSource: wardSource || "user_selected",
          locationPincode: locationPincode || null,
          specificLocation,
          // The pin the citizen placed, never a geocoder's approximation.
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
          complaintSubtypeId: selectedSubtype ? selectedSubtype.id : null,
          otherDescription: otherDescription || null,
          title,
          description,
          mediaPath,
          isAnonymous
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Failed to submit complaint.");
        setSubmitting(false);
        return;
      }
      setResult(data);
      setDir(1);
      setStep(5);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForNewComplaint() {
    setResult(null);
    setTitle("");
    setDescription("");
    setMediaFile(null);
    setIsAnonymous(false);
    setSelectedSubtype(null);
    setSelectedCategoryId(null);
    setOtherDescription("");
    setTitleEdited(false);
    setSpecificLocation("");
    setLocationPincode("");
    setManualStreetName("");
    setStreetType("");
    setAutofilled(new Set());
    setWardVerdict({ status: "idle" });
    setWardSource("");
    editedFields.current.clear();
    setCoords(null);
    goToStep(1);
  }

  if (!checkedSession) {
    return (
      <div className="flex min-h-screen flex-col diq-bg">
        <Header homeHref="/citizen" nav={CITIZEN_NAV} />
        <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-10 sm:px-6">
          <Skeleton h={30} w={240} className="mb-3" />
          <Skeleton h={14} w={300} className="mb-8" />
          <div className="mb-8 flex justify-between gap-6">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={32} w={32} r={16} />)}</div>
          <div className="card space-y-4">
            <Skeleton h={18} w={190} />
            <div className="grid grid-cols-3 gap-4"><Skeleton h={44} /><Skeleton h={44} /><Skeleton h={44} /></div>
            <Skeleton h={44} />
            <Skeleton h={44} />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const ErrorLine = () => (
    <AnimatePresence>
      {submitError && (
        <motion.p key={submitError} role="alert" className="form-error mt-4" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          {submitError}
        </motion.p>
      )}
    </AnimatePresence>
  );
  const StepHead = ({ icon: Icon, title, sub }: { icon: typeof UserRound; title: string; sub: React.ReactNode }) => (
    <div className="mb-6 flex items-start gap-3">
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-navy-50 text-navy-700 ring-1 ring-inset ring-navy-200">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        <p className="mt-0.5 text-sm text-ink-muted">{sub}</p>
      </div>
    </div>
  );
  const zoneLabel = zones.find((z) => String(z.id) === zoneId);
  const typeCategory = categories.find((c) => c.id === selectedCategoryId);
  const lang = /[஀-௿]/.test(description) ? "தமிழ்" : description.trim() ? "English / Tanglish" : null;

  return (
    <MotionConfig reducedMotion="user">
    <div className="flex min-h-screen flex-col diq-bg">
      <Header userName={me?.email} homeHref="/citizen" nav={CITIZEN_NAV} />
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-7">
          <Link href="/citizen" className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-subtle transition hover:text-navy-600">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to overview
          </Link>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-ink">File a complaint</h1>
          <p className="mt-1 text-[15px] text-ink-muted">Public Grievance Redressal &mdash; Greater Chennai Corporation</p>
        </div>

        {/* Stepper: the line fills between steps; completed steps take you back */}
        {step < 5 && (
          <div className="mb-8">
            <Stepper steps={STEPS.map((s) => s.label)} current={step - 1} onStep={(i) => goToStep(i + 1)} />
          </div>
        )}

        <div className="relative">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div key={step} custom={dir} initial={{ opacity: 0, x: 28 * dir }} animate={{ opacity: 1, x: 0, transition: { duration: 0.34, ease: EASE_OUT } }}
          exit={{ opacity: 0, x: -20 * dir, transition: { duration: 0.16 } }}>

        {/* STEP 1: WHO IS REPORTING */}
        {step === 1 && (
          <div className="card mx-auto max-w-3xl">
            <StepHead icon={UserRound} title="Your details" sub={missingDetails.length === 0
              ? "Prefilled from your profile — you only enter these once."
              : "Fields marked * are required. They are saved to your profile, so you will not be asked again."} />

            {/* Everything already known: shown, not re-asked */}
            <div className="rounded-[12px] border border-canvas-border bg-canvas-sunken/60 p-4">
              <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-navy-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-navy-700 ring-1 ring-inset ring-navy-200">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Prefilled from your profile
              </p>
              <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
                <div className="col-span-2 sm:col-span-1">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">Name</dt>
                  <dd className="mt-0.5 truncate text-sm font-semibold text-ink">{[firstName, lastName].filter(Boolean).join(" ") || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">Email</dt>
                  <dd className="mt-0.5 truncate text-sm text-ink">{personEmail || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">Mobile</dt>
                  <dd className="mt-0.5 truncate font-mono text-sm text-ink">{mobileNumber || "—"}</dd>
                </div>
                {!missingDetails.includes("gender") && (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">Gender</dt>
                    <dd className="mt-0.5 text-sm text-ink">{gender || "—"}</dd>
                  </div>
                )}
                {!missingDetails.includes("streetAddress") && (
                  <div className="col-span-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">Your address</dt>
                    <dd className="mt-0.5 truncate text-sm text-ink">{streetAddress || "—"}{pincode ? ` · ${pincode}` : ""}</dd>
                  </div>
                )}
              </dl>
            </div>

            <p className="mt-2.5 text-xs text-ink-muted">
              Something out of date?{" "}
              <Link href="/profile" className="font-semibold text-navy-600 hover:underline">Update it in your profile</Link>.
            </p>

            {/* Only the genuinely missing pieces are asked for */}
            {missingDetails.length > 0 && (
              <div className="mt-6 border-t border-canvas-border pt-5">
                <p className="mb-4 flex items-start gap-1.5 text-sm text-ink-muted">
                  <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-faint" aria-hidden="true" />
                  These are missing from your profile. Fill them in once and future complaints will use them automatically.
                </p>

                {missingDetails.includes("firstName") && (
                  <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="form-label" htmlFor="fname">First name <span className="text-red-600">*</span></label>
                      <input id="fname" required className="form-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label" htmlFor="lname">Last name <span className="normal-case text-ink-faint">(optional)</span></label>
                      <input id="lname" className="form-input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                    </div>
                  </div>
                )}

                {missingDetails.includes("gender") && (
                  <div className="mb-5">
                    <span className="form-label">Gender <span className="text-red-600">*</span></span>
                    <div className="flex flex-wrap gap-2">
                      {["Male", "Female", "Transgender"].map((g) => (
                        <button key={g} type="button" onClick={() => setGender(g)} aria-pressed={gender === g} className={gender === g ? "chip-active" : "chip-idle"}>
                          {gender === g && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {missingDetails.includes("streetAddress") && (
                  <div className="mb-5">
                    <label className="form-label" htmlFor="streetAddr">
                      Your address <span className="text-red-600">*</span> <span className="normal-case text-ink-faint">(where you live, not the problem location)</span>
                    </label>
                    <input id="streetAddr" required className="form-input" value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} />
                  </div>
                )}

                {missingDetails.includes("mobileNumber") && (
                  <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="form-label" htmlFor="cmobile">Mobile number<span className="text-red-600">*</span></label>
                      <input id="cmobile" inputMode="numeric" maxLength={10} required className="form-input font-mono" value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ""))} />
                      <p className="form-hint">10 digits, so the department can reach you.</p>
                    </div>
                    <div>
                      <label className="form-label" htmlFor="cpincode">Your PIN code <span className="normal-case text-ink-faint">(optional)</span></label>
                      <input id="cpincode" inputMode="numeric" maxLength={6} className={`form-input font-mono ${pincode && !/^\d{6}$/.test(pincode) ? "border-red-300" : ""}`}
                        value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} aria-invalid={pincode ? !/^\d{6}$/.test(pincode) : undefined} />
                      {pincode && !/^\d{6}$/.test(pincode) && <p className="form-error">A PIN code has 6 digits.</p>}
                    </div>
                  </div>
                )}
              </div>
            )}

            <ErrorLine />

            <div className="mt-7 flex justify-between border-t border-canvas-border pt-5">
              <Link href="/citizen" className="btn-secondary">Cancel</Link>
              <button type="button" disabled={savingProfile} className="btn-primary group"
                onClick={async () => {
                  const err = validateDetails();
                  if (err) { setSubmitError(err); return; }
                  await saveDetailsToProfile();
                  goToStep(2);
                }}>
                {savingProfile ? (<><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Saving&hellip;</>) : (
                  <>Next: Location<ArrowRight className="h-4 w-4 transition-transform duration-200 ease-spring group-hover:translate-x-0.5" aria-hidden="true" /></>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: LOCATION — the map (60%) beside the address (40%) */}
        {step === 2 && (
          <div className="card">
            <StepHead icon={MapPin} title="Complaint location" sub="Drop a pin where the problem is; the ward and zone fill in by themselves." />

            <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="form-label mb-0">Point to the problem on the map</span>
                  <span className="text-xs text-ink-faint">Optional &mdash; you can type the details instead</span>
                </div>
                <MapPicker
                  value={coords}
                  onChange={handleMapSelection}
                  footer={
                    <div className="mt-3">
                      <AnimatePresence mode="wait" initial={false}>
                        {wardVerdict.status === "checking" && (
                          <motion.p key="chk" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 text-sm text-ink-muted">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Checking which ward this falls in&hellip;
                          </motion.p>
                        )}
                        {wardVerdict.status === "resolved" && (
                          <motion.div key={`ok-${wardVerdict.wardNumber}`} initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
                            transition={spring.snappy} className="rounded-[12px] border border-emerald-200 bg-emerald-50 p-3.5">
                            <p className="flex flex-wrap items-center gap-2 text-sm text-emerald-900">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas-raised px-2.5 py-1 font-semibold text-ink ring-1 ring-inset ring-emerald-200">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                                Ward {wardVerdict.wardNumber}{wardVerdict.zoneName ? ` · ${wardVerdict.zoneName}` : ""}
                              </span>
                              {wardVerdict.ambiguous && (
                                <span>
                                  The boundary data returns more than one ward here
                                  {wardVerdict.candidateWards ? ` (${wardVerdict.candidateWards.join(", ")})` : ""}, so please confirm the ward.
                                </span>
                              )}
                            </p>
                            <p className="mt-2 border-t border-emerald-200 pt-2 text-[11px] leading-relaxed text-emerald-800">
                              Ward determined by point-in-polygon against {wardVerdict.provenance.sourceLabel || "ward boundary data"}.
                              {!wardVerdict.provenance.official && " This is a community dataset, not an official Corporation publication — an officer confirms the ward during processing."}
                            </p>
                          </motion.div>
                        )}
                        {wardVerdict.status === "outside_boundary" && (
                          <motion.div key="out" role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-[12px] border border-red-200 bg-red-50 p-3.5">
                            <p className="flex items-start gap-2 text-sm text-red-800">
                              <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                              <span>{wardVerdict.message}</span>
                            </p>
                          </motion.div>
                        )}
                        {wardVerdict.status === "unavailable" && (
                          <motion.div key="na" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-[12px] border border-amber-200 bg-amber-50 p-3.5">
                            <p className="flex items-start gap-2 text-sm text-amber-800">
                              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                              <span>{wardVerdict.message} The pin is still saved with your complaint, and the ward you select will be used as-is.</span>
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {autofilled.size > 0 && (
                        <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-muted">
                          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ink-faint" aria-hidden="true" />
                          Filled in from the map: {Array.from(autofilled).join(", ")}. Check them and correct anything that looks wrong.
                        </p>
                      )}
                    </div>
                  }
                />
              </div>

              {/* ---- Address details ---- */}
              <div className="min-w-0">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">Address details</span>
                  <span className="text-xs text-ink-faint">{coords ? "Confirm or correct these" : "Fill these in, or drop a pin"}</span>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="form-label" htmlFor="zone">Zone<span className="text-red-600">*</span></label>
                    <Combobox id="zone" required noun="zone"
                      options={zones.map((z) => ({ value: String(z.id), label: `Zone ${z.zone_number} — ${z.zone_name}` }))}
                      value={zoneId} onChange={setZoneId} loading={zones.length === 0} />
                    {autofilled.has("zone") && (
                      <p className="mt-1.5 inline-flex items-start gap-1.5 text-xs text-emerald-700"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />Set from the map pin.</p>
                    )}
                  </div>

                  {/* Street is typed in. GCC's street list covers only part of the
                      city and repeats names heavily, so a free text field is more
                      reliable than picking from it. */}
                  <div className="grid grid-cols-[1fr_140px] gap-3">
                    <div>
                      <label className="form-label" htmlFor="manualStreet">Street<span className="text-red-600">*</span></label>
                      <input id="manualStreet" required maxLength={255} className="form-input" placeholder="e.g. Gandhi Nagar 2nd Cross" value={manualStreetName}
                        onChange={(e) => { markEdited("manualStreetName"); setManualStreetName(e.target.value); }} />
                    </div>
                    <div>
                      <label className="form-label" htmlFor="streetType">Type</label>
                      <select id="streetType" className="form-input" value={streetType} onChange={(e) => setStreetType(e.target.value)}>
                        <option value="">Optional</option>
                        {STREET_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="form-label" htmlFor="ward">Ward<span className="text-red-600">*</span></label>
                    <Combobox id="ward" required noun="ward"
                      options={wards.map((w) => ({
                        value: String(w.wardNumber),
                        // Number and zone together, so the ward is identifiable
                        // without knowing the numbering by heart.
                        label: `Ward ${w.wardNumber} — ${w.zoneName}`,
                        hint: `Zone ${w.zoneNumber}`
                      }))}
                      value={wardNumber}
                      onChange={(v) => { setWardNumber(v); setWardSource(v ? "user_selected" : ""); }}
                      loading={wards.length === 0} />
                    {wardSource === "map_boundary" && selectedWard ? (
                      <p className="mt-1.5 inline-flex items-start gap-1.5 text-xs text-emerald-700"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />Determined from the map pin.</p>
                    ) : (
                      wardNotice && (
                        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-ink-muted"><Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ink-faint" aria-hidden="true" />{wardNotice}</p>
                      )
                    )}
                  </div>

                  <div>
                    <label className="form-label" htmlFor="locationPincode">PIN code of this location <span className="normal-case text-ink-faint">(optional)</span></label>
                    <input id="locationPincode" inputMode="numeric" maxLength={6} className={`form-input font-mono ${locationPincode && !/^\d{6}$/.test(locationPincode) ? "border-red-300" : ""}`}
                      value={locationPincode}
                      onChange={(e) => { markEdited("locationPincode"); setLocationPincode(e.target.value.replace(/\D/g, "")); }} />
                    {locationPincode && !/^\d{6}$/.test(locationPincode) && <p className="form-error">A PIN code has 6 digits.</p>}
                  </div>

                  <div>
                    <label className="form-label" htmlFor="specificLoc">Specific location <span className="normal-case text-ink-faint">(door no. / landmark)</span></label>
                    <input id="specificLoc" className="form-input" value={specificLocation}
                      onChange={(e) => { markEdited("specificLocation"); setSpecificLocation(e.target.value); }} />
                  </div>
                </div>
              </div>
            </div>

            <ErrorLine />

            <div className="mt-7 flex justify-between border-t border-canvas-border pt-5">
              <button type="button" className="btn-secondary" onClick={() => goToStep(1)}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />Back
              </button>
              <button type="button" className="btn-primary group"
                onClick={() => {
                  const err = validateLocation();
                  if (err) { setSubmitError(err); return; }
                  goToStep(3);
                }}>
                Next: Type<ArrowRight className="h-4 w-4 transition-transform duration-200 ease-spring group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: DEPARTMENT + TYPE */}
        {step === 3 && (
          <div className="card">
            <StepHead icon={Building2} title="Complaint type" sub="Choose one complaint type from the Corporation's official list." />

            <ComplaintTypeSelector
              categories={categories}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={setSelectedCategoryId}
              otherDescription={otherDescription}
              onOtherDescriptionChange={setOtherDescription}
              selectedId={selectedSubtype ? selectedSubtype.id : null}
              loading={taxonomyLoading}
              source={taxonomySource}
              onSelect={(sub) => {
                setSelectedSubtype(sub);
                // Autofill the title from the chosen subcomplaint, but never
                // over a title the citizen has already written.
                if (sub && !titleEdited) setTitle(sub.label);
                if (!sub && !titleEdited) setTitle("");
              }}
            />

            <ErrorLine />

            <div className="mt-7 flex justify-between border-t border-canvas-border pt-5">
              <button type="button" className="btn-secondary" onClick={() => goToStep(2)}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />Back
              </button>
              <button type="button" className="btn-primary group"
                onClick={() => {
                  const err = validateType();
                  if (err) { setSubmitError(err); return; }
                  goToStep(4);
                }}>
                Next: Details<ArrowRight className="h-4 w-4 transition-transform duration-200 ease-spring group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: COMPLAINT DETAILS, with the review summary beside it */}
        {step === 4 && (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <form className="card" onSubmit={handleSubmit} noValidate>
              <StepHead icon={FileText} title="Complaint details" sub="Describe the issue and attach evidence." />

              <div className="mb-5">
                <label className="form-label" htmlFor="ctitle">Complaint title</label>
                <input id="ctitle" required maxLength={200} className="form-input" placeholder="Short summary of the issue" value={title}
                  onChange={(e) => {
                    // Editing the title detaches it from the complaint type, so
                    // changing the type later no longer overwrites these words.
                    setTitleEdited(true);
                    setTitle(e.target.value);
                  }} />
                {selectedSubtype && !titleEdited && (
                  <p className="form-hint">Filled in from the complaint type you chose. Edit it freely &mdash; that will not change the selected type.</p>
                )}
              </div>

              <div className="mb-5">
                <div className="flex items-baseline justify-between gap-3">
                  <label className="form-label" htmlFor="cdesc">Details of complaint</label>
                  <span className="text-[11.5px] text-ink-faint">English, <span lang="ta">தமிழ்</span> or Tanglish — all welcome</span>
                </div>
                <textarea id="cdesc" required rows={6} maxLength={400} className="form-input" placeholder="What is the problem, since when, and how is it affecting people?"
                  value={description} onChange={(e) => setDescription(e.target.value)} />
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="text-ink-faint">{lang ? `Writing in ${lang}` : ""}</span>
                  <span className={`font-mono tabular-nums ${description.length > 360 ? "text-gold-600" : "text-ink-faint"}`}>{description.length}/400</span>
                </div>
              </div>

              <div className="mb-5">
                <span className="form-label">Photograph / video <span className="normal-case text-ink-faint">(optional, max 10MB)</span></span>
                <AnimatePresence mode="wait" initial={false}>
                  {mediaFile ? (
                    <motion.div key="file" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                      className="flex items-center gap-3 rounded-[12px] border border-navy-200 bg-navy-50 p-3">
                      {mediaPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mediaPreview} alt="" className="h-14 w-14 flex-shrink-0 rounded-[8px] object-cover" />
                      ) : (
                        <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[8px] bg-canvas-raised text-navy-700"><ImagePlus className="h-5 w-5" aria-hidden="true" /></span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{mediaFile.name}</p>
                        <p className="font-mono text-xs text-ink-subtle">{(mediaFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <button type="button" onClick={() => setMediaFile(null)} aria-label="Remove attachment"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle transition hover:bg-canvas-raised hover:text-red-600">
                        <X className="h-4 w-4" />
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div key="drop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Dropzone accept="image/jpeg,image/png,video/mp4" multiple={false} onFiles={(f) => setMediaFile(f[0] ?? null)}>
                        <span><b>Choose a photo or video</b> or drag it here<br /><span className="text-xs text-ink-faint">JPG, PNG or MP4 &middot; up to 10MB</span></span>
                      </Dropzone>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-[12px] border border-canvas-border bg-canvas-sunken/60 p-3.5 text-sm text-ink-muted transition hover:border-navy-200">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-navy" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
                <span><span className="font-medium text-ink">File anonymously</span> &mdash; your name and contact details will be hidden from department officers.</span>
              </label>

              <AnimatePresence>
                {submitError && (
                  <motion.div role="alert" className="alert-error mb-5" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    <span>{submitError}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex justify-between border-t border-canvas-border pt-5">
                <button type="button" className="btn-secondary" onClick={() => goToStep(3)} disabled={submitting}>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />Back
                </button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Submitting...</>) : (<>Submit complaint<Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /></>)}
                </button>
              </div>
            </form>

            {/* review: everything entered, each part editable */}
            <aside className="card sticky top-[84px] space-y-4 p-5" aria-label="Review">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">Review</h3>
              {[
                { k: "You", v: [[firstName, lastName].filter(Boolean).join(" "), mobileNumber].filter(Boolean).join(" · ") || "—", s: 1 },
                { k: "Where", v: [manualStreetName && `${manualStreetName}${streetType ? ` ${streetType}` : ""}`, wardNumber && `Ward ${wardNumber}`, zoneLabel?.zone_name].filter(Boolean).join(" · ") || "—", s: 2 },
                { k: "Type", v: selectedSubtype ? `${typeCategory?.name ?? ""} › ${selectedSubtype.label}` : "—", s: 3, d: selectedSubtype?.departmentName }
              ].map((r) => (
                <div key={r.k} className="border-b border-canvas-border pb-3 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-ink-subtle">{r.k}</span>
                    <button type="button" onClick={() => goToStep(r.s)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-navy-600 hover:underline">
                      <PencilLine className="h-3 w-3" aria-hidden="true" />Edit
                    </button>
                  </div>
                  <p className="mt-0.5 text-[13.5px] leading-snug text-ink">{r.v}</p>
                  {r.d && <p className="mt-1 text-[12px] text-ink-muted">Goes to <b className="font-semibold text-ink">{r.d}</b></p>}
                </div>
              ))}
              {coords && <p className="font-mono text-[11.5px] text-ink-faint">Pin {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p>}
            </aside>
          </div>
        )}

        {/* STEP 5: CONFIRMATION */}
        {step === 5 && result && (
          <div className="card mx-auto max-w-2xl text-center">
            <div className="relative mx-auto mb-4 grid place-items-center">
              <SuccessCheck size={76} />
              <Confetti />
            </div>
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Complaint registered</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
              Your complaint has been registered in the Public Grievance Redressal Portal of GCC. Use your complaint number to check its status at any time.
            </p>

            <div className="mx-auto mt-6 max-w-sm overflow-hidden rounded-[12px] border border-canvas-border text-left">
              <div className="flex items-center justify-between gap-3 border-b border-canvas-border bg-navy-50 px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-navy-600">Complaint number</p>
                  <p className="mt-1 font-mono text-xl font-semibold tracking-tight text-navy-700"><RollingText text={result.complaintCode} delay={0.5} /></p>
                </div>
                <button type="button" className="ui-iconbtn sm" aria-label="Copy complaint number" title="Copy complaint number"
                  onClick={async () => { try { await navigator.clipboard.writeText(result.complaintCode); setCopiedCode(true); setTimeout(() => setCopiedCode(false), 1400); } catch { /* blocked */ } }}>
                  {copiedCode ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                </button>
              </div>
              <dl className="grid grid-cols-2 divide-x divide-canvas-border bg-canvas-raised">
                <div className="px-5 py-3.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">Department</dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink">{result.department}</dd>
                </div>
                <div className="px-5 py-3.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">Type</dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink">{result.complaintType}</dd>
                </div>
              </dl>
            </div>

            <div className="mx-auto mt-7 max-w-sm text-left">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">What happens next</h3>
              <Timeline items={[
                { state: "done", title: "Complaint filed", body: "Just now. You can track it any time." },
                { state: "now", title: "Department officer reviews it", body: `${result.department} approves and plans the work.` },
                { state: "todo", title: "Work in progress", body: "The officer reports back with photos when it's done." },
                { state: "todo", title: "Verified by the Collector", body: "The Collector checks the work and closes it." }
              ]} />
            </div>

            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href={`/citizen/track-complaints?code=${encodeURIComponent(result.complaintCode)}`} className="btn-primary group">
                Track this complaint<ArrowRight className="h-4 w-4 transition-transform duration-200 ease-spring group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <button type="button" className="btn-secondary" onClick={resetForNewComplaint}>File another complaint</button>
            </div>
          </div>
        )}
        </motion.div>
        </AnimatePresence>
        </div>
      </main>
      <Footer />
    </div>
    </MotionConfig>
  );
}
