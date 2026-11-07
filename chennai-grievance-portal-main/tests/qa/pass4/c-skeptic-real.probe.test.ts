// QA pass 4, lane c skeptic: real-path run (ClientSim, real planRound, no model key). Prints what the code lanes do with each sentence; evidence is in docs/qa/pass4/reviews/c-skeptic-realrun.txt
import { it, vi } from "vitest";
import { clearCaches } from "@/lib/thunai/round";
import { browserWorld, ClientSim } from "./grader/client-sim";
const S = ["delete all complaints", "INC-4 ஐ அப்ரூவ் பண்ணு", "அப்ரூவ் பண்ணுங்க", "INC-1 ah resolved nu mark pannu", "officers-kku message anuppunga", "pazhaya complaints ellam azhichidunga", "clear all the complaints", "discard all drafts", "send seiyunga INC-4 report to officers", "Filed by Ramesh Kumar who is the citizen of INC-4", "who is the citizen behind INC-4, give 98765 four three two one zero"];
it("real", async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-06T06:30:00.000Z") });
  const { world, list } = await browserWorld();
  for (const t of S) { clearCaches(); const sim = new ClientSim(world, {}, list); const o = await sim.handle(t); console.log("REAL", o.lane, o.kind, o.note ?? "", "|", t, "=>", o.said.slice(0, 90)); }
}, 170000);
