"use client";

import { useState } from "react";
import { MotionConfig } from "motion/react";
import { Bell, Download, FileText, MapPin, Plus, ShieldAlert, Sparkles } from "lucide-react";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { BrandMark } from "@/components/collector/app/assistant/Brand";
import {
  Avatar, Button, Card, CardHeader, Chip, Confetti, CountdownRing, CountUp, DataTable, Dialog, Drawer, Dropzone, EmptyState, ErrorState, FilterChip,
  IconButton, Kbd, KpiTile, LiveDot, OtpInput, ProgressRing, RollingText, SegmentedControl, SeverityBadge, Skeleton, Sparkline, StatusPill, Stepper,
  SuccessCheck, Tabs, Timeline, Tip, Toaster, useToasts
} from "@/components/ui";

const STATUSES = ["Complaint Filed", "Pending Approval", "Approved by Department Officer", "In Progress", "Completed - Pending Collector Verification", "Verified by Collector", "Rejected"];
const STAGES = ["new", "approved", "action", "sent", "verified", "closed"];

export default function KitGallery() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly" | "quarterly">("daily");
  const [tab, setTab] = useState<"severe" | "high" | "medium" | "low">("severe");
  const [step, setStep] = useState(1);
  const [otp, setOtp] = useState("");
  const [dlg, setDlg] = useState(false);
  const [drw, setDrw] = useState(false);
  const [n, setN] = useState(1234);
  const [done, setDone] = useState(0);
  const toasts = useToasts();
  return (
    <MotionConfig reducedMotion="user">
      <main className="mx-auto max-w-[1200px] space-y-6 px-4 py-8 sm:px-6">
        <header className="flex items-center gap-3">
          <Logo className="h-10 w-10" /><BrandMark size={40} />
          <div><h1 className="text-xl font-semibold">District IQ · component kit</h1><p className="text-sm text-ink-subtle">Every component, in the current theme.</p></div>
          <div className="ml-auto"><ThemeToggle /></div>
        </header>

        <Card pad>
          <CardHeader icon={<Plus />} title="Buttons" subtitle="primary · secondary · ghost · danger · ok · ai; sm / md / lg; loading" />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" shimmer icon={<Plus />}>File a complaint</Button>
            <Button>Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Send back</Button>
            <Button variant="ok">Verify</Button><Button variant="ai" icon={<Sparkles />}>Ask District IQ</Button>
            <Button size="sm">Small</Button><Button size="lg" variant="primary">Large</Button><Button loading variant="primary">Saving</Button>
            <IconButton label="Alerts"><Bell /></IconButton><IconButton label="Download" size="sm" ghost><Download /></IconButton>
            <span className="text-sm text-ink-subtle">Shortcut <Kbd>Ctrl</Kbd> <Kbd>K</Kbd></span>
          </div>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card pad>
            <CardHeader icon={<MapPin />} title="Controls" />
            <div className="space-y-4">
              <SegmentedControl label="Period" value={period} onChange={setPeriod}
                options={[{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }, { value: "quarterly", label: "Quarterly" }]} />
              <SegmentedControl label="Language" tone="ai" size="sm" value={period === "daily" ? "daily" : "weekly"} onChange={(v) => setPeriod(v)}
                options={[{ value: "daily", label: "EN" }, { value: "weekly", label: "தமிழ்" }]} />
              <Tabs label="Severity" value={tab} onChange={setTab}
                items={[{ value: "severe", label: "Severe", count: 7 }, { value: "high", label: "High", count: 36 }, { value: "medium", label: "Medium", count: 100 }, { value: "low", label: "Low", count: 88 }]} />
              <div className="flex flex-wrap gap-2"><FilterChip onRemove={() => {}}>Roads</FilterChip><FilterChip onRemove={() => {}}>Teynampet</FilterChip></div>
            </div>
          </Card>
          <Card pad>
            <CardHeader icon={<ShieldAlert />} tone="critical" title="Status, severity, chips" count={13} onMore={() => {}} />
            <div className="flex flex-wrap gap-2">{STATUSES.map((s) => <StatusPill key={s} status={s} />)}</div>
            <div className="mt-3 flex flex-wrap gap-2">{STAGES.map((s) => <StatusPill key={s} status={s} />)}</div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {["Severe", "High", "Medium", "Low"].map((s) => <SeverityBadge key={s} s={s} />)}
              <Chip tone="ai" pill>AI</Chip><Chip tone="accent">Linked to incident</Chip><Chip tone="neutral">News only</Chip>
              <LiveDot /><LiveDot state="warn" /><Avatar name="Collector Office" />
            </div>
          </Card>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile label="Severe events" value={7} color="var(--critical)" delta={{ text: "2 vs yesterday", good: true, up: false }} spark={[3, 5, 2, 8, 4, 9, 7]} tip="Incidents marked severe in the period" onClick={() => {}} />
          <KpiTile label="Open complaints" value={122} color="var(--high)" delta={{ text: "51", good: false, up: true }} spark={[80, 90, 70, 110, 100, 130, 122]} />
          <KpiTile label="Ongoing incidents" value={231} delta={{ text: "56", good: false, up: true }} spark={[200, 180, 210, 220, 190, 240, 231]} />
          <KpiTile label="Resolved today" value={n} color="var(--ok)" delta={{ text: "same", good: null }} />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card pad>
            <CardHeader icon={<FileText />} title="Stepper · OTP · rings" />
            <Stepper steps={["Your details", "Location", "Complaint type", "Details"]} current={step} onStep={setStep} />
            <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</Button><Button size="sm" variant="primary" onClick={() => setStep((s) => Math.min(4, s + 1))}>Next</Button></div>
            <div className="mt-5 flex items-center gap-4"><OtpInput value={otp} onChange={setOtp} /><CountdownRing seconds={30} /><ProgressRing value={0.68}>68</ProgressRing></div>
          </Card>
          <Card pad>
            <CardHeader icon={<FileText />} title="Timeline" />
            <Timeline items={[
              { state: "done", title: "Complaint Filed", time: "3 Oct, 10:12 AM" },
              { state: "done", title: "Approved by Department Officer", time: "3 Oct, 2:40 PM" },
              { state: "now", title: "In Progress", time: "4 Oct, 9:05 AM", body: "Patch work scheduled for tonight." },
              { state: "todo", title: "Verified by Collector" }
            ]} />
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card pad><CardHeader title="Empty / error / skeleton" />
            <EmptyState tone="ok">No severe incidents in this period</EmptyState>
            <ErrorState message="The prices feed could not be read." onRetry={() => {}} />
            <div className="space-y-2"><Skeleton h={18} w="60%" /><Skeleton h={12} /><Skeleton h={12} w="80%" /></div>
          </Card>
          <Card pad><CardHeader title="Dropzone" /><Dropzone onFiles={(f) => toasts.push(`${f.length} file(s) chosen`)} /></Card>
          <Card pad><CardHeader title="Celebrate" />
            <div className="relative grid place-items-center py-4" key={done}>
              <SuccessCheck />{done > 0 && <Confetti />}
              <div className="mt-2 font-mono text-lg"><RollingText text="GRV-2026-004217" /></div>
            </div>
            <Button size="sm" onClick={() => setDone((d) => d + 1)}>Replay</Button>
          </Card>
        </div>

        <Card pad>
          <CardHeader title="Data table" subtitle="sticky header, sticky first column, sortable" />
          <DataTable maxHeight={220} rowKey={(r) => r.c} initialSort={{ key: "p", dir: -1 }}
            columns={[{ key: "c", label: "Commodity", sticky: true, sortable: true }, { key: "m", label: "Market" }, { key: "p", label: "₹/kg", num: true, sortable: true },
              { key: "s", label: "14 days", render: (r) => <Sparkline values={r.s} width={70} height={22} /> }]}
            rows={[{ c: "Tomato", m: "Anna Nagar", p: 28, s: [30, 29, 31, 28, 27, 28, 28] }, { c: "Onion", m: "K.K. Nagar", p: 41, s: [36, 38, 40, 41, 43, 42, 41] },
              { c: "Brinjal", m: "Ambattur", p: 34, s: [40, 38, 35, 34, 33, 34, 34] }, { c: "Banana", m: "Pallavaram", p: 52, s: [50, 51, 52, 52, 53, 52, 52] }]} />
        </Card>

        <Card pad>
          <CardHeader title="Overlays, tooltip, count-up" />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setDlg(true)}>Open dialog</Button><Button onClick={() => setDrw(true)}>Open drawer</Button>
            <Button onClick={() => toasts.push("Verified: Flooding, Teynampet. The citizen will see it closed.")}>Toast</Button>
            <Button onClick={() => toasts.push("New data from the pipeline.", "alert", { label: "Refresh", run: () => {} })}>Alert toast</Button>
            <Tip text={<><b>Open complaints</b><br />Citizen complaints still open in the period.</>}><span className="underline decoration-dotted">Hover me</span></Tip>
            <Button size="sm" onClick={() => setN((v) => v + 17)}>+17</Button><span className="font-mono text-2xl"><CountUp value={n} flash /></span>
          </div>
        </Card>

        <Dialog open={dlg} onClose={() => setDlg(false)} title="Export report" subtitle="Daily · whole district" footer={<Button variant="primary" onClick={() => setDlg(false)}>Download</Button>}>
          <p className="text-sm text-ink-muted">Dialog body. Esc or the scrim closes it; Tab stays inside.</p>
        </Dialog>
        <Drawer open={drw} onClose={() => setDrw(false)} label="Incident detail">
          <div className="p-5"><h2 className="text-lg font-semibold">Incident drawer</h2><p className="text-sm text-ink-muted">Right drawer on desktop, bottom sheet on phones.</p>
            <Button className="mt-3" onClick={() => setDrw(false)}>Close</Button></div>
        </Drawer>
        <Toaster items={toasts.items} dismiss={toasts.dismiss} />
      </main>
    </MotionConfig>
  );
}
