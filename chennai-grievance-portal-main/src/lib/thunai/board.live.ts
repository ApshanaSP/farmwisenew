/**
 * 28 Nov: the dashboards a sentence asks for (board.ts), built on a dry-run copy of the store with NO model: what code reads the sentence as,
 * then each screen's parts, its notes and its spoken line. Nothing is saved (AWS_STORE_DRY_RUN=1), no AI is called.
 *   set BOARD_Q=compare Anna Nagar and Adyar|overall summary of Royapuram&& npx vitest run --config vitest.live.config.ts src/lib/thunai/board.live.ts
 */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-v18/durable.sqlite";
process.env.JARVIS_KEEPWARM = "0";
process.env.DISTRICT_IQ_JOBS = "off";
process.env.AI_PROVIDER = "none";
import { it } from "vitest";
import { serverWorld } from "./world";
import { serverHands } from "./data";
import { buildScreen, emptySlots, type Hands } from "./screens";
import { checkScreen } from "./agent";
import { boardAsk, boardSlots } from "./board";
import { istWall, turnWhen } from "./v18/when";
import { checkStage, figuresOf, figuresOk } from "./stage";

const QS = (process.env.BOARD_Q ?? "Anna Nagar-யும். அடையாரையும் compare பண்ணு.|Create a comparative dashboard of Anna Nagar and Adyar for severe incidents|overall summary of Royapuram|Anna Nagar-க்கு weekly report எடு.").split("|").map((x) => x.trim()).filter(Boolean);

it("the dashboards, built", async () => {
  const world = await serverWorld();
  const hands = serverHands({ email: "collector@chennai.gov.in", role: "collector", lockDept: null }) as unknown as Hands;
  for (const q of QS) {
    const a = boardAsk(q, world);
    if (!a) { console.log(`== ${q}\n   not a dashboard request`); continue; }
    const t0 = Date.now();
    hands.turnSpan = turnWhen(q, null, istWall(Date.now()));
    const sc = checkScreen({ recipe: a.recipe, ...boardSlots(a) }, world, null)!;
    const { doc } = await buildScreen(sc.recipe, { ...emptySlots(), ...sc.slots }, { period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null }, world, hands, q, undefined, /[஀-௿]/.test(q) ? "ta" : "en");
    const lang = doc.lang ?? "en";
    console.log(`== ${q} (${Date.now() - t0} ms)\n   read as ${JSON.stringify(a)}\n   ${doc.recipe}: ${doc.title} | valid ${checkStage(doc).ok} | say's figures on screen ${figuresOk(doc.say[lang], figuresOf(doc))}`);
    console.log(`   blocks: ${doc.blocks.map((b) => `${b.kind}:${b.id}`).join(", ")}`);
    for (const b of doc.blocks) {
      if (b.kind === "Compare") console.log(`   compare: ${b.sides.map((x) => `${x.label} ${JSON.stringify(x.values)}`).join(" | ")}`);
      if (b.kind === "Table") console.log(`   ${b.title}: ${b.rows.map((r) => r.cells.join(" / ")).join(" || ")}`);
      if (b.kind === "Kpis") console.log(`   tiles: ${b.items.map((k) => `${k.label} ${k.value}`).join(", ")}`);
      if (b.kind === "Answer" && b.id === "prices") console.log(`   prices: ${b.facts.map((f) => `${f.label} ${f.value}`).join(", ")}`);
    }
    console.log(`   say: ${doc.say[lang]}\n   takeaway: ${doc.takeaway?.[lang] ?? "-"}\n   notes: ${doc.notes.join(" | ") || "-"}\n   sources: ${doc.sources.join(", ")}`);
  }
}, 600_000);
