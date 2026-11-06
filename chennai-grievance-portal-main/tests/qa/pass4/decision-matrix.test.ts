/**
 * QA pass 4: the decision matrix, as a permanent test. Each action on a fresh real incident of the pinned snapshot, through the real
 * routes and the real store (its own durable file for each run), against what the code and docs say it does. A gap that is still open
 * is an `it.fails` whose name starts with its finding id (docs/qa/pass4/findings/decisions.json): the fixer changes it to `it`.
 *
 *   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/decision-matrix.test.ts
 *
 * Fakes, at the boundary only: the signed-in person (lib/auth), "Confirm it's you" off (STEP_UP=off, test mode only), the model (lib/ai/gateway,
 * no key in this process: the planner's reply is written here) and the embedding model (lib/assistant/embed: a hash, since the model file in this
 * worktree is a pointer and a real run would be a model call). The clock is pinned to the frozen moment. Everything else is the real code.
 */
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  process.env.STEP_UP = "off";
  (process.env as Record<string, string>).NODE_ENV = "test";
  process.env.AI_CHAT_MODE = "agent";
  process.env.OFFICER_UPLOAD_DIR = `${process.env.THUNAI_DIR}/../uploads`;
  return { who: {} as Record<string, unknown>, ai: false, plan: null as unknown, question: "", plannerCalls: 0 };
});

vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()),
  getActivePortalSession: async (p: string) => h.who[p] ?? null,
  getSessionFromCookies: async () => h.who.citizen ?? null,
  getActiveSession: async () => h.who.citizen ?? null }));

vi.mock("@/lib/ai/gateway", async (orig) => {
  const m = await orig<typeof import("@/lib/ai/gateway")>();
  const info = { provider: "fake", model: "fake", ms: 1, role: "reasoning" };
  return { ...m,
    aiStatus: () => ({ available: h.ai, problem: null, providers: [], stt: "" }),
    generateJson: async (c: { name: string }) => {
      if (h.ai && c.name === "agent0") return { object: { action: "query", language: "en", question: h.question, brief: null, calls: [], done: true, show: null, clarify: null, refusal: null, visual: false, chartType: null }, info };
      if (h.ai && c.name === "planner") { h.plannerCalls++; return { object: h.plan, info }; }
      throw new m.AiUnavailableError();
    } };
});

vi.mock("@/lib/assistant/embed", async (orig) => {
  const m = await orig<typeof import("@/lib/assistant/embed")>();
  const DIM = 768;
  const one = (t: string, out: Float32Array, at: number) => { let x = 7; for (let i = 0; i < t.length; i++) x = (x * 31 + t.charCodeAt(i)) >>> 0; for (let d = 0; d < DIM; d++) { x = (x * 1103515245 + 12345) >>> 0; out[at + d] = (x / 2 ** 31 - 1) / Math.sqrt(DIM); } };
  return { ...m, warmUp: () => undefined, semanticSearch: async () => null, embedStatus: () => ({ ready: false }),
    embed: async (texts: string[]) => { const vecs = new Float32Array(texts.length * DIM); texts.forEach((t, i) => one(t, vecs, i * DIM)); return { vecs, dim: DIM }; } };
});

const COLLECTOR = { userId: 1000000001, email: "qa.collector@example.test", role: "collector", tv: 0 };
const officer = (userId: number, email: string) => ({ userId, email, role: "department_officer", tv: 0 });
const OFF_SWM = officer(1000000002, "qa.officer.swm@example.test"), OFF_ELE = officer(1000000003, "qa.officer.ele@example.test"), OFF_WRD = officer(1000000004, "qa.officer.cmw@example.test");
const CITIZEN_A = { userId: 1000000005, email: "qa.citizen.a@example.test", role: "citizen", tv: 0 };
const CITIZEN_B = { userId: 1000000006, email: "qa.citizen.b@example.test", role: "citizen", tv: 0 };

const FROZEN = "2026-11-06T06:30:00.000Z";
const W = "weekly" as const;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const ID = { resolve: "INC-20261103-1D9CB6", reject: "INC-20261105-45E2DD", reopenSevere: "INC-20261103-FB02F4", verify: "INC-20261105-0476D7", escalate: "INC-20261104-EA19E3",
  note: "INC-20261103-8989A6", officerClose: "INC-20261102-8EC358", flip: "INC-20261104-FC41F8", flipBack: "INC-20261103-6E8CD6", resolveEscalate: "INC-20261103-B74560", verifyNoFlag: "INC-20261105-D0CC25",
  sendBackTwice: "INC-20261104-22A6D5", reopenThenSend: "INC-20261101-738431", officerSend: "INC-20261103-53934E-1", rejectBack: "INC-20261102-A7CC18", plan: "INC-20261104-DE5CBD", index: "INC-20261103-22C9F8", indexClosed: "INC-20261103-DF9D08", lag: "INC-20261106-707839", untouched: "INC-20261106-D065CE" };
const HOTSPOT = "HOT-STREETLIGHT_ELECTRICAL-003";
const CAT = "STREETLIGHT_ELECTRICAL";

let intel: typeof import("@/lib/collector/intel");
let insightsMod: typeof import("@/lib/collector/insights");
let officerData: typeof import("@/lib/officer/data");
let officerInsights: typeof import("@/lib/officer/insights");
let tools: typeof import("@/lib/assistant/tools");
let incidentsMod: typeof import("@/lib/assistant/incidents");
let compile: typeof import("@/lib/assistant/compile");
let catalog: typeof import("@/lib/assistant/catalog");
let decisionsRoute: typeof import("@/app/api/collector/decisions/route");
let reportRoute: typeof import("@/app/api/officer/grievances/[id]/report/route");
let grievanceRoute: typeof import("@/app/api/officer/grievances/[id]/route");
let complaintRoute: typeof import("@/app/api/complaints/[code]/route");
let pool: typeof import("@/lib/db").default;

const post = (url: string, body: unknown) => new NextRequest(`http://127.0.0.1${url}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
async function decide(id: string, decision: string, note?: string) {
  h.who = { collector: COLLECTOR };
  const r = await decisionsRoute.POST(post("/api/collector/decisions", { incidentIds: [id], decision, note: note ?? null }));
  if (r.status !== 201) throw new Error(`${decision} on ${id}: ${r.status}`);
}
function reportReq(id: string, step: string) {
  const f = new FormData();
  f.set("remarks", "QA: work finished and checked on site."); f.set("step", step);
  f.append("photos", new Blob([PNG], { type: "image/png" }), "done.png");
  return new NextRequest(`http://127.0.0.1/api/officer/grievances/${id}/report`, { method: "POST", body: f });
}
const ctx = (id: string) => ({ params: { id } });
const kpi = async () => (await intel.overview(W, null)).kpi.cur as Record<string, number>;
const listCount = async (status: string, q: string) => (await intel.list({ period: W, zone: null, dept: null, sev: null, status, q, sort: "t", dir: -1, page: 0, scope: "period" })).incidents;
const page = async (id: string) => (await intel.incident(id))!.incident;
const stage = async (dept: string, id: string) => (await officerData.grievanceDetail((await officerData.deptProfile(dept))!, id))?.grievance.stage ?? null;
const tool = async (name: string, args: Record<string, unknown>) => (await tools.runTool(name, args)).data as Record<string, any>;
const advance = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

/** A complaint filed into the incident the way the pipeline files it (events.source_record_id = the number), owned by a test citizen, in this run's own durable file. */
async function fileComplaint(id: string, owner: number): Promise<string> {
  const [ev] = await (await import("@/lib/collector/db")).default.query<any[]>(`SELECT source_record_id AS code, reported_at AS at FROM events WHERE source = 'grievance' AND incident_id = ? LIMIT 1`, [id]);
  const code = String(ev[0].code);
  await pool.query(`INSERT INTO complaints (complaint_code, user_id, first_name, gender, street_address, zone_id, ward_number, department_id, title, description, status, created_at)
    VALUES (?, ?, 'QA', 'Other', 'QA address', 1, 1, 1, 'QA complaint', 'QA complaint', 'Complaint Filed', ?)`, [code, owner, String(ev[0].at).slice(0, 19).replace("T", " ")]);
  return code;
}
async function tracker(code: string, who: unknown = CITIZEN_A) {
  h.who = { citizen: who };
  const r = await complaintRoute.GET(new NextRequest(`http://127.0.0.1/api/complaints/${code}`), { params: { code } });
  return { http: r.status, body: await r.json() as Record<string, any> };
}

const seen: Record<string, any> = {};
const LANCE_ROOT = path.resolve(process.env.THUNAI_DIR!, "..", "lance-root");
const REAL_INDEX = path.join(process.cwd(), "data", "lancedb", "incidents.lance"); // the table: a server makes the empty folder itself when it looks for an index
let realIndexBefore = false;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(FROZEN));
  await import("@/lib/collector/derive");
  pool = (await import("@/lib/db")).default;
  // lance.ts names its folder from the working folder when it first loads, and tools.ts below imports it: it must load here first, in a scratch
  // folder, or this test writes an index of fake vectors into the worktree's data/lancedb, where every server of this worktree then finds it
  realIndexBefore = fs.existsSync(REAL_INDEX);
  fs.mkdirSync(path.join(LANCE_ROOT, "data", "embeddings"), { recursive: true });
  await import("@/lib/collector/db");
  const cwd = process.cwd.bind(process);
  process.cwd = () => LANCE_ROOT;
  try { await import("@/lib/assistant/lance"); } finally { process.cwd = cwd; }
  intel = await import("@/lib/collector/intel");
  insightsMod = await import("@/lib/collector/insights");
  officerData = await import("@/lib/officer/data");
  officerInsights = await import("@/lib/officer/insights");
  tools = await import("@/lib/assistant/tools");
  incidentsMod = await import("@/lib/assistant/incidents");
  compile = await import("@/lib/assistant/compile");
  catalog = await import("@/lib/assistant/catalog");
  decisionsRoute = await import("@/app/api/collector/decisions/route");
  reportRoute = await import("@/app/api/officer/grievances/[id]/report/route");
  grievanceRoute = await import("@/app/api/officer/grievances/[id]/route");
  complaintRoute = await import("@/app/api/complaints/[code]/route");
  await pool.query("UPDATE users SET dept_code = 'PWD-WRD' WHERE id = 1000000004");

  const ele = (await officerData.deptProfile("GCC-ELE"))!, swm = (await officerData.deptProfile("GCC-SWM"))!, wrd = (await officerData.deptProfile("PWD-WRD"))!;
  const scope = { period: W, zone: null, taluk: null };
  const officerWork = async (dept: string) => (await officerInsights.deptInsights(dept, scope) as any[]).find((m) => (m.key ?? m.id) === "work");
  const checks = (work: any) => String(work?.kpis?.find((k: any) => k.label === "Collector's checks")?.sub ?? "");
  const hotspotOpen = async () => (await insightsMod.insights(W, null, null, { cat: CAT }, "trends")).patterns.hotspots.find((x: any) => x.id === HOTSPOT)?.open;
  const exportHas = async (dept: string, id: string) => (await intel.exportRows(W, null, dept)).some((r) => r.id === id);

  // -- resolve
  const code = await fileComplaint(ID.resolve, CITIZEN_A.userId);
  seen.resolve = { before: { kpi: await kpi(), hotspot: await hotspotOpen(), counted: await incidentsMod.countResolved({ period: W } as never, await intel.asOf()),
    book: (await insightsMod.insights(W, null, null, {}, "briefing")).book?.good.resolved, tracker: (await tracker(code)).body.complaint.status } };
  await decide(ID.resolve, "resolve");
  seen.resolve.after = { kpi: await kpi(), openList: await listCount("open", ID.resolve), resolvedList: await listCount("Resolved", ID.resolve), page: await page(ID.resolve),
    stage: await stage("GCC-ELE", ID.resolve), tracker: (await tracker(code)).body.complaint.status, search: (await intel.search(ID.resolve)).incidents.find((i) => i.id === ID.resolve),
    hotspot: await hotspotOpen(), counted: await incidentsMod.countResolved({ period: W } as never, await intel.asOf()), book: (await insightsMod.insights(W, null, null, {}, "briefing")).book?.good.resolved,
    pattern: ((await insightsMod.pattern({ kind: "hotspot", id: HOTSPOT })) as any)?.incidents?.find((x: any) => x.id === ID.resolve),
    bookRow: (await insightsMod.insights(W, 4, "GCC-ELE", {}, "briefing")).book?.departments.flatMap((d) => d.items).find((x) => x.id === ID.resolve) };
  // no index yet in this run's scratch folder: search_records answers from its keyword lane, as the live server does here
  const resolved = seen.resolve.after.page;
  const keywordLane = async (text: string, extra: Record<string, unknown> = {}) => (await tool("search_records", { text: text.slice(0, 200), scope: { period: W, zone: 4, dept: "GCC-ELE" }, ...extra })).incidents.find((x: any) => x.id === ID.resolve);
  seen.resolve.after.searchRecords = await keywordLane(String(resolved.loc));
  seen.resolve.after.searchIncidentsOnly = await keywordLane(String(resolved.loc), { kinds: ["incidents"] });
  seen.resolve.after.searchByTitle = await keywordLane(String(resolved.title));

  // -- an officer's send: it reaches My Tasks and the citizen; the gap is that it is then on the action list twice
  const sendCode = await fileComplaint(ID.officerSend, CITIZEN_A.userId);
  const sendTasks = (await intel.overview(W, null)).tasks.count;
  h.who = { officer: OFF_WRD };
  const sentOne = await reportRoute.POST(reportReq(ID.officerSend, "send"), ctx(ID.officerSend));
  seen.officerSend = { http: sentOne.status, stage: await stage("PWD-WRD", ID.officerSend), tracker: (await tracker(sendCode)).body.complaint.status, tasksBefore: sendTasks,
    tasksAfter: (await intel.overview(W, null)).tasks.count, csv: (await intel.exportRows(W, null, "PWD-WRD")).filter((r) => r.id === ID.officerSend).map((r) => r.list) };

  // -- reject
  await fileComplaint(ID.reject, CITIZEN_A.userId);
  const kr = await kpi();
  await decide(ID.reject, "reject", "QA: returned.");
  seen.reject = { before: kr, after: await kpi(), page: await page(ID.reject), stage: await stage("GCC-ELE", ID.reject), feedback: (await officerData.officerOverview(ele, scope)).feedback.some((f) => f.id === ID.reject) };

  // -- reject, then reopen: what the citizen reads
  const backCode = await fileComplaint(ID.rejectBack, CITIZEN_A.userId);
  await decide(ID.rejectBack, "reject", "QA: the reason it was rejected.");
  const rejected = (await tracker(backCode)).body.complaint;
  await new Promise((r) => setTimeout(r, 1100)); // whole seconds: a tie would hide the order
  await decide(ID.rejectBack, "reopen", "QA: sent back.");
  const reopened = (await tracker(backCode)).body.complaint;
  seen.rejectBack = { rejected: { status: rejected.status, stage: rejected.rejected_stage, remarks: rejected.remarks }, reopened: { status: reopened.status, stage: reopened.rejected_stage, remarks: reopened.remarks } };

  // -- reopen a severe incident the pipeline closed
  const kro = await kpi();
  await decide(ID.reopenSevere, "reopen");
  seen.reopen = { before: kro, after: await kpi(), page: await page(ID.reopenSevere), stage: await stage("PWD-WRD", ID.reopenSevere), inExport: await exportHas("PWD-WRD", ID.reopenSevere),
    attention: (await insightsMod.insights(W, 9, "PWD-WRD", {}, "briefing")).briefing.attention.find((a) => a.id === ID.reopenSevere) };

  // -- verify
  const verifyCode = await fileComplaint(ID.verify, CITIZEN_A.userId);
  const kv = await kpi();
  await decide(ID.verify, "verify");
  const wrdOv = await officerData.officerOverview(wrd, scope);
  seen.verify = { before: kv, after: await kpi(), page: await page(ID.verify), stage: await stage("PWD-WRD", ID.verify), tracker: (await tracker(verifyCode)).body.complaint.status,
    officerOpen: wrdOv.counts.new + wrdOv.counts.action + wrdOv.counts.sent, boardOpen: Number(wrdOv.board.kpi.cur.ongoing) };
  await decide(ID.verifyNoFlag, "verify");
  seen.verifyNoFlag = { rowVerified: Number((await page(ID.verifyNoFlag)).verified), verifiedFilter: (await intel.list({ period: W, zone: null, dept: null, sev: null, status: "verified", q: ID.verifyNoFlag, sort: "t", dir: -1, page: 0, scope: "all" })).incidents };

  // -- escalate, note
  const ke = await kpi();
  const escStage = await stage("GCC-SWM", ID.escalate);
  await decide(ID.escalate, "escalate");
  seen.escalate = { before: ke, after: await kpi(), page: await page(ID.escalate), stageBefore: escStage, stage: await stage("GCC-SWM", ID.escalate) };
  const kn = await kpi();
  const notePage = await page(ID.note);
  await decide(ID.note, "note", "QA note.");
  seen.note = { before: kn, after: await kpi(), pageBefore: notePage, page: await page(ID.note), decisions: (await intel.incident(ID.note))!.decisions.length };

  // -- an officer's close
  const closeCode = await fileComplaint(ID.officerClose, CITIZEN_A.userId);
  const wb = await officerWork("GCC-SWM");
  const kc = await kpi();
  h.who = { officer: OFF_SWM };
  const closed = await reportRoute.POST(reportReq(ID.officerClose, "close"), ctx(ID.officerClose));
  const swmOv = await officerData.officerOverview(swm, scope);
  seen.officerClose = { http: closed.status, before: kc, after: await kpi(), page: await page(ID.officerClose), stage: await stage("GCC-SWM", ID.officerClose), tracker: (await tracker(closeCode)).body.complaint.status,
    feedback: swmOv.feedback.some((f) => f.id === ID.officerClose), checksBefore: checks(wb), checksAfter: checks(await officerWork("GCC-SWM")) };

  // -- sequences
  await decide(ID.flip, "resolve"); await decide(ID.flip, "reopen"); await decide(ID.flip, "resolve");
  seen.flip = await page(ID.flip);
  await decide(ID.flipBack, "reopen"); await decide(ID.flipBack, "resolve"); await decide(ID.flipBack, "reopen");
  seen.flipBack = await page(ID.flipBack);
  await fileComplaint(ID.resolveEscalate, CITIZEN_A.userId);
  await decide(ID.resolveEscalate, "resolve"); await decide(ID.resolveEscalate, "escalate");
  seen.resolveEscalate = { page: await page(ID.resolveEscalate), stage: await stage("GCC-SWM", ID.resolveEscalate) };

  // -- the flows the screens can reach: the officer's report and the Collector's Send back, twice
  h.who = { officer: OFF_WRD };
  const send1 = await reportRoute.POST(reportReq(ID.sendBackTwice, "send"), ctx(ID.sendBackTwice));
  const tasks1 = (await intel.overview(W, null)).tasks.count;
  await decide(ID.sendBackTwice, "reopen", "Sent back.");
  const stage1 = await stage("PWD-WRD", ID.sendBackTwice);
  // the store's times are whole seconds, and a person's clicks are seconds apart: a tie would hide the later report
  await new Promise((r) => setTimeout(r, 1100));
  h.who = { officer: OFF_WRD };
  const send2 = await reportRoute.POST(reportReq(ID.sendBackTwice, "send"), ctx(ID.sendBackTwice));
  await new Promise((r) => setTimeout(r, 1100));
  await decide(ID.sendBackTwice, "reopen", "Sent back.");
  seen.sendBackTwice = { http: [send1.status, send2.status], tasksAfterFirstSend: tasks1, stageAfterFirstBack: stage1, stage: await stage("PWD-WRD", ID.sendBackTwice), tasks: (await intel.overview(W, null)).tasks.count };
  // -- a report on an incident the pipeline had closed and the Collector reopened
  const t0 = (await intel.overview(W, null)).tasks.count;
  await decide(ID.reopenThenSend, "reopen", "QA: not done.");
  await new Promise((r) => setTimeout(r, 1100)); // whole seconds, as above: a tie is not what this checks
  h.who = { officer: OFF_WRD };
  const sentAgain = await reportRoute.POST(reportReq(ID.reopenThenSend, "send"), ctx(ID.reopenThenSend));
  seen.reopenThenSend = { http: sentAgain.status, stage: await stage("PWD-WRD", ID.reopenThenSend), before: t0, after: (await intel.overview(W, null)).tasks.count };
}, 280_000);

afterAll(() => {
  vi.useRealTimers();
  // for checking by hand what each it.fails really saw: goes to the path given, never into the repo (the rows hold titles)
  if (process.env.QA_DM_DEBUG) fs.writeFileSync(`${process.env.QA_DM_DEBUG}.seen.json`, JSON.stringify(seen, null, 1));
});

describe("the actions move what they are designed to move", () => {
  it("resolve closes the incident on the console, the list, the page, the officer's stage and the citizen's tracker", () => {
    const { before, after } = seen.resolve;
    expect(after.kpi.ongoing - before.kpi.ongoing).toBe(-1);
    expect(after.kpi.resolved - before.kpi.resolved).toBe(1);
    expect(after.kpi.complaints - before.kpi.complaints).toBe(-1);
    expect(after.openList).toBe(0);
    expect(after.resolvedList).toBe(1);
    expect(after.page).toMatchObject({ status: "Resolved", open: 0, decision: "resolve", verified: 1 });
    expect(after.stage).toBe("verified");
    expect(before.tracker).toBe("Complaint Filed");
    expect(after.tracker).toBe("Verified by Collector");
  });
  it("reject closes it as Rejected and takes it off the officer's stages", () => {
    expect(seen.reject.after.ongoing - seen.reject.before.ongoing).toBe(-1);
    expect(seen.reject.after.resolved - seen.reject.before.resolved).toBe(0);
    expect(seen.reject.page).toMatchObject({ status: "Rejected", open: 0 });
    expect(seen.reject.stage).toBe("closed");
  });
  it("reopen brings back an incident the pipeline closed, and the officer sees it in action", () => {
    expect(seen.reopen.after.ongoing - seen.reopen.before.ongoing).toBe(1);
    expect(seen.reopen.after.resolved - seen.reopen.before.resolved).toBe(-1);
    expect(seen.reopen.page).toMatchObject({ status: "Open", open: 1 });
    expect(seen.reopen.stage).toBe("action");
    expect(seen.reopen.page.why.needsYou).toBe(true);
  });
  it("verify leaves the console's status (effective.ts) and tells the officer and the citizen it is checked", () => {
    expect(seen.verify.page).toMatchObject({ status: "In progress", open: 1, decision: "verify" });
    expect(seen.verify.stage).toBe("verified");
    expect(seen.verify.tracker).toBe("Verified by Collector");
  });
  it("escalate and note move no status and no figure; the page records them", () => {
    expect(seen.escalate.after).toEqual(seen.escalate.before);
    expect(seen.escalate.page).toMatchObject({ decision: "escalate", escalated: 1, open: 1 });
    expect(seen.escalate.stage).toBe(seen.escalate.stageBefore);
    expect(seen.note.after).toEqual(seen.note.before);
    expect(seen.note.page.status).toBe(seen.note.pageBefore.status);
    expect(seen.note.decisions).toBe(1);
  });
  it("an officer's close counts as resolved on every console, and the citizen sees the department's close", () => {
    expect(seen.officerClose.http).toBe(201);
    expect(seen.officerClose.after.ongoing - seen.officerClose.before.ongoing).toBe(-1);
    expect(seen.officerClose.after.complaints - seen.officerClose.before.complaints).toBe(-2);
    expect(seen.officerClose.page).toMatchObject({ status: "Resolved", open: 0, decision: "resolve" });
    expect(seen.officerClose.stage).toBe("verified");
    expect(seen.officerClose.tracker).toBe("Resolved by Department");
  });
  it("an officer's send reaches My Tasks, and the citizen sees it waiting for the Collector", () => {
    expect(seen.officerSend.http).toBe(201);
    expect(seen.officerSend.stage).toBe("sent");
    expect(seen.officerSend.tasksAfter - seen.officerSend.tasksBefore).toBe(1);
    expect(seen.officerSend.tracker).toBe("Completed - Pending Collector Verification");
  });
  it("a reject reaches the citizen with its reason, and a reopen after it takes the rejected state away", () => {
    expect(seen.rejectBack.rejected).toMatchObject({ status: "Rejected", stage: "Collector", remarks: "QA: the reason it was rejected." });
    expect(seen.rejectBack.reopened).toMatchObject({ status: "In Progress", stage: null });
  });
  it("search_records' keyword lane finds the incident, so the check on its status below reads the right row", () => {
    expect(seen.resolve.after.searchRecords?.id).toBe(ID.resolve);
    expect(seen.resolve.after.searchRecords?.match).toBe("keywords");
  });
  it("Ask District IQ's figures catch up with a decision within the memo's minute", async () => {
    const before = Number((await tool("overview_kpis", { scope: { period: W } })).cur.ongoing);
    await decide(ID.lag, "resolve");
    advance(61_000);
    expect(Number((await tool("overview_kpis", { scope: { period: W } })).cur.ongoing)).toBe(before - 1);
    expect((await tool("incident_detail", { id: ID.lag })).incident).toMatchObject({ status: "Resolved", open: false });
  });
});

describe("who may act", () => {
  const body = (decision: string) => post("/api/collector/decisions", { incidentIds: [ID.untouched], decision, note: "QA" });
  it("a citizen, an officer and no session cannot make any Collector decision", async () => {
    for (const d of ["resolve", "reject", "reopen", "verify", "escalate", "note"]) {
      for (const who of [{}, { citizen: CITIZEN_A }, { officer: OFF_ELE }, { officer: OFF_SWM }]) {
        h.who = who;
        expect((await decisionsRoute.POST(body(d))).status, `${d} ${JSON.stringify(who)}`).toBe(401);
      }
    }
    expect((await intel.incident(ID.untouched))!.decisions.length).toBe(0);
  });
  it("an officer of another department cannot read, approve or close a grievance", async () => {
    h.who = { officer: OFF_SWM };
    expect((await grievanceRoute.GET(new NextRequest(`http://127.0.0.1/api/officer/grievances/${ID.untouched}`), ctx(ID.untouched))).status).toBe(404);
    expect((await grievanceRoute.POST(post(`/api/officer/grievances/${ID.untouched}`, { step: "approve" }), ctx(ID.untouched))).status).toBe(404);
    expect((await reportRoute.POST(reportReq(ID.untouched, "close"), ctx(ID.untouched))).status).toBe(404);
  });
  it("a citizen and the Collector cannot use the officer's routes", async () => {
    for (const who of [{}, { citizen: CITIZEN_A }, { collector: COLLECTOR }]) {
      h.who = who;
      expect((await grievanceRoute.POST(post(`/api/officer/grievances/${ID.untouched}`, { step: "approve" }), ctx(ID.untouched))).status).toBe(401);
      expect((await reportRoute.POST(reportReq(ID.untouched, "close"), ctx(ID.untouched))).status).toBe(401);
    }
  });
  it("the order of the work holds: verify only severe, no close from new, no close of a severe, no send of a non-severe", async () => {
    h.who = { collector: COLLECTOR };
    expect((await decisionsRoute.POST(post("/api/collector/decisions", { incidentIds: [ID.untouched], decision: "verify" }))).status).toBe(409);
    expect((await decisionsRoute.POST(post("/api/collector/decisions", { incidentIds: [ID.untouched], decision: "reject" }))).status).toBe(400);
    h.who = { officer: OFF_ELE };
    expect((await reportRoute.POST(reportReq(ID.untouched, "close"), ctx(ID.untouched))).status).toBe(409);
    expect((await reportRoute.POST(reportReq("INC-20261106-A90262", "send"), ctx("INC-20261106-A90262"))).status).toBe(409);
  });
  it("a citizen cannot read another citizen's complaint", async () => {
    const [r] = await pool.query<any[]>("SELECT complaint_code AS c FROM complaints WHERE user_id = ? LIMIT 1", [CITIZEN_A.userId]);
    expect((await tracker(String(r[0].c), CITIZEN_B)).http).toBe(404);
  });
});

describe("gaps still open", () => {
  it.fails("DECISIONS-1: resolve, reopen, resolve within two minutes ends resolved (the third answers 201 and is dropped)", () => {
    expect(seen.flip).toMatchObject({ status: "Resolved", open: 0, decision: "resolve" });
  });
  it.fails("DECISIONS-1: reopen, resolve, reopen within two minutes ends open", () => {
    expect(seen.flipBack).toMatchObject({ status: "Open", open: 1, decision: "reopen" });
  });
  it.fails("DECISIONS-1: a second Send back on a new report is recorded (the screens' own buttons, within two minutes)", () => {
    expect(seen.sendBackTwice.http).toEqual([201, 201]);
    expect(seen.sendBackTwice.stageAfterFirstBack).toBe("action");
    expect(seen.sendBackTwice.stage).toBe("action");
  });
  it.fails("DECISIONS-15: an officer's report on an incident the Collector reopened reaches My Tasks", () => {
    expect(seen.reopenThenSend.http).toBe(201);
    expect(seen.reopenThenSend.stage).toBe("sent");
    expect(seen.reopenThenSend.after - seen.reopenThenSend.before).toBe(1);
  });
  it.fails("DECISIONS-2: \"Verify and close\" closes the incident on the console too, as it does for the officer and the citizen", () => {
    expect(seen.verify.after.ongoing - seen.verify.before.ongoing).toBe(-1);
  });
  it.fails("DECISIONS-2: the officer's page does not show two open figures once a case is verified", () => {
    expect(seen.verify.officerOpen).toBe(seen.verify.boardOpen);
  });
  it.fails("DECISIONS-3: an escalate after a resolve does not reopen the incident on the console while the officer and the citizen see it closed", () => {
    expect(seen.resolveEscalate.page.open).toBe(0);
    expect(seen.resolveEscalate.stage).toBe("verified");
  });
  it.fails("DECISIONS-4: the search box's rows and Ask District IQ's search tool carry the decided status", () => {
    expect(seen.resolve.after.search).toMatchObject({ status: "Resolved", open: 0 });
  });
  it.fails("DECISIONS-4: search_records' keyword lane carries the decided status", () => {
    expect(seen.resolve.after.searchRecords.status).toBe("Resolved");
  });
  it.fails("DECISIONS-18: after a reject and a reopen, the citizen no longer reads the reason it was rejected", () => {
    expect(seen.rejectBack.reopened.remarks ?? "").not.toContain("the reason it was rejected");
  });
  it.fails("DECISIONS-16: an officer's send leaves one row per incident on the action list (CSV)", () => {
    expect(seen.officerSend.csv.length).toBe(1);
  });
  it.fails("DECISIONS-17: with no index, search_records still answers when only incidents are asked for", () => {
    expect(seen.resolve.after.searchIncidentsOnly?.id).toBe(ID.resolve);
  });
  it.fails("DECISIONS-17: with no index, search_records finds an incident by the title the console shows", () => {
    expect(seen.resolve.after.searchByTitle?.id).toBe(ID.resolve);
  });
  it.fails("DECISIONS-5: an officer's own close is not listed as a Collector's decision", () => {
    expect(seen.officerClose.feedback).toBe(false);
  });
  it.fails("DECISIONS-5: an officer's own close does not count in \"Collector's checks\"", () => {
    expect(seen.officerClose.checksAfter).toBe(seen.officerClose.checksBefore);
  });
  it.fails("DECISIONS-6: a case returned with reject reaches the officer who must act on it", () => {
    expect(seen.reject.feedback).toBe(true);
  });
  it.fails("DECISIONS-7: a reopened severe incident is back on the Collector's action list (CSV)", () => {
    expect(seen.reopen.page.why.needsYou).toBe(true);
    expect(seen.reopen.inExport).toBe(true);
  });
  it.fails("DECISIONS-8: Ask District IQ's \"how many resolved\" counts a Collector's resolve", () => {
    expect(seen.resolve.after.counted.n - seen.resolve.before.counted.n).toBe(1);
  });
  it.fails("DECISIONS-8: the Briefing's \"resolved\" counts a Collector's resolve", () => {
    expect(seen.resolve.after.book - seen.resolve.before.book).toBe(1);
  });
  it.fails("DECISIONS-9: a hotspot's \"N open\" on Trends follows a decision", () => {
    expect(seen.resolve.after.hotspot - seen.resolve.before.hotspot).toBe(-1);
  });
  it.fails("DECISIONS-10: a pattern's incident row shows the decided status, not \"In progress (closed)\"", () => {
    expect(seen.resolve.after.pattern).toMatchObject({ status: "Resolved", open: 0 });
  });
  it.fails("DECISIONS-10: a reopened incident under Needs your attention does not say Resolved", () => {
    expect(seen.reopen.attention).toBeTruthy();
    expect(seen.reopen.attention.status).toBe("Open");
  });
  it.fails("DECISIONS-10: the Briefing book's department row shows the decided status", () => {
    expect(seen.resolve.after.bookRow).toBeTruthy();
    expect(seen.resolve.after.bookRow.status).toBe("Resolved");
  });
  it.fails("DECISIONS-11: an incident the Collector verified is in the list's verified filter, as its row says", () => {
    expect(seen.verifyNoFlag.rowVerified).toBe(1);
    expect(seen.verifyNoFlag.verifiedFilter).toBe(1);
  });
  it.fails("DECISIONS-12: Ask District IQ's figures move at once when a decision is made", async () => {
    advance(61_000);
    const before = Number((await tool("overview_kpis", { scope: { period: W } })).cur.ongoing);
    await decide("INC-20261106-EC69F1", "resolve");
    expect(Number((await tool("overview_kpis", { scope: { period: W } })).cur.ongoing)).toBe(before - 1);
  });
});

describe("OPEN-16: the two readers on the pipeline's flag", () => {
  /** What the planner (a model) would write for "how many of these are still open": the catalog offers is_open as "still open". */
  const stillOpen = (id: string) => ({ id: "still_open", purpose: "still open", table: "incidents", measures: [{ fn: "count", field: null, alias: "n" }], dimensions: [],
    filters: [{ field: "incident_id", op: "eq", value: id, values: null }, { field: "is_open", op: "eq", value: 1, values: null }], timeRange: null, compare: null, sort: [], limit: null, derive: [] });
  const asFilter = (id: string, status: string) => ({ ...stillOpen(id), filters: [{ field: "incident_id", op: "eq", value: id, values: null }, { field: "status_std", op: "eq", value: status, values: null }] });
  const count = async (q: any) => {
    const c = compile.compileQuery(q as never, await catalog.loadCatalog(), await intel.asOf(), null);
    return Number((await compile.runCompiled(c, await intel.asOf())).rows[0]?.n ?? 0);
  };
  const planned: Record<string, number> = {};
  let answer: Record<string, any> = {};
  /** the figure the card shows for the one query */
  const shownFigure = () => {
    const rows = answer.data?.rows ?? answer.rows ?? answer.tableRows ?? null;
    const fromRows = Array.isArray(rows) && rows.length ? Number(rows[0].n) : NaN;
    if (!Number.isNaN(fromRows)) return fromRows;
    const m = String(answer.headline ?? "").match(/\d[\d,]*/);
    return m ? Number(m[0].replace(/,/g, "")) : NaN;
  };

  beforeAll(async () => {
    planned.openBefore = await count(stillOpen(ID.plan));
    await decide(ID.plan, "resolve");
    planned.openAfter = await count(stillOpen(ID.plan));
    planned.resolvedAfter = await count(asFilter(ID.plan, "Resolved"));
    planned.console = (await page(ID.plan)).open;
    // the whole path: a question, the fake model's agent step and plan, the real compile and store, the real answer card (the composer has no model, so the code writes it)
    const { ask } = await import("@/lib/assistant/pipeline");
    h.ai = true;
    h.question = "how many of these incidents are still open, by the planner";
    h.plan = { queries: [stillOpen(ID.plan)], answerGoal: "the count", chartIntent: "kpi", assumptions: [], unsupported: null };
    try {
      const r = await ask({ user: "qa.collector@example.test", sessionId: null, message: h.question, inputMode: "text", language: "en", scope: { period: W, zone: null, dept: null, cat: null, taluk: null } as never, replyTo: null, stage: () => undefined });
      answer = r.card as unknown as Record<string, any>;
    } finally { h.ai = false; }
    if (process.env.QA_DM_DEBUG) fs.writeFileSync(process.env.QA_DM_DEBUG, JSON.stringify(answer, null, 1));
  }, 120_000);

  it("the plan compiles and runs on the real store, and the console has moved", () => {
    expect(planned.openBefore).toBe(1);
    expect(planned.console).toBe(0);
  });
  it("the whole path really went through the fake model's plan and shows a figure", () => {
    expect(h.plannerCalls).toBeGreaterThan(0);
    expect(Number.isNaN(shownFigure())).toBe(false);
  });
  it.fails("DECISIONS-13: a model-written query's \"still open\" follows the Collector's decision", () => {
    expect(planned.openAfter).toBe(0);
  });
  it.fails("DECISIONS-13: a model-written query's status filter follows the Collector's decision", () => {
    expect(planned.resolvedAfter).toBe(1);
  });
  it.fails("DECISIONS-13: the whole path, a question through a fake model's plan, answers with the decided figure", () => {
    expect(shownFigure()).toBe(0);
  });
});

describe("OPEN-16: the search index", () => {
  let lance: typeof import("@/lib/assistant/lance");
  const found: Record<string, any> = {};

  beforeAll(async () => {
    // the older vectors, where lance.ts (loaded in the scratch folder at the top) looks for them
    for (const f of fs.readdirSync(path.join(process.cwd(), "data", "embeddings"))) {
      const to = path.join(LANCE_ROOT, "data", "embeddings", f);
      if (!fs.existsSync(to)) fs.linkSync(path.join(process.cwd(), "data", "embeddings", f), to);
    }
    lance = await import("@/lib/assistant/lance");
    found.sync1 = await lance.syncLance({ batch: 64, maxNew: 1500 });
    const inc = await page(ID.index);
    const closed = await page(ID.indexClosed);
    const epoch = (t: unknown) => Math.floor(Date.parse(`${String(t).replace(" ", "T")}+05:30`) / 1000);
    /** the open-only filter as fastpath.ts narrowed() sends it, on the record's own minute */
    const hit = async (row: Record<string, any>, openOnly = true) => (await lance.hybridSearch("incidents", String(row.title ?? row.type), { since: epoch(row.t) - 60, until: epoch(row.t) + 60, openOnly }, 40))?.find((x) => x.id === row.id) ?? null;
    found.inIndex = await hit(inc, false);
    found.closedInIndex = await hit(closed, false);
    found.before = await hit(inc);
    found.closedBefore = await hit(closed);
    await decide(ID.index, "resolve");
    await decide(ID.indexClosed, "reopen");
    // what the server does when it keeps the index in step with the store: records whose text or fields changed are rewritten
    found.sync2 = await lance.syncLance({ batch: 64, maxNew: 0 });
    found.after = await hit(inc);
    found.closedAfter = await hit(closed);
    found.afterAny = await hit(inc, false);
    found.page = await page(ID.index);
    found.closedPage = await page(ID.indexClosed);
  }, 280_000);

  it("the index went to the scratch folder and never to the worktree's data/lancedb", () => {
    expect(fs.existsSync(path.join(LANCE_ROOT, "data", "lancedb", "incidents.lance"))).toBe(true);
    expect(fs.existsSync(REAL_INDEX)).toBe(realIndexBefore);
  });
  it("the index is built from the real store, both incidents are in it, and the console has moved", () => {
    expect(found.inIndex?.id).toBe(ID.index);
    expect(found.closedInIndex?.id).toBe(ID.indexClosed);
    expect(found.before?.id).toBe(ID.index);
    expect(found.closedBefore).toBeNull();
    expect(found.page.open).toBe(0);
    expect(found.closedPage.open).toBe(1);
    expect(found.afterAny?.id).toBe(ID.index);
  });
  it.fails("DECISIONS-14: after a resolve and a sync, the open-only search no longer returns the incident", () => {
    expect(found.after).toBeNull();
  });
  it.fails("DECISIONS-14: after a reopen and a sync, the open-only search finds the incident", () => {
    expect(found.closedAfter?.id).toBe(ID.indexClosed);
  });
  it.fails("DECISIONS-14: the index's record carries the decided status, which search_records shows", () => {
    expect(found.afterAny.rec.status).toBe("Resolved");
    expect(Number(found.afterAny.rec.open)).toBe(0);
  });
});
