/**
 * v6, Phase 4: the news report Jarvis reads for an incident on its screen ("read the article" over a case): the incident's newest
 * report from a news medium, as the console's case page lists it (lib/collector/intel.ts incident: news media and government
 * sources only; newsask.ts newestNewsDoc picks it). Server only. Null when the incident came from complaints alone.
 */
import { incident } from "@/lib/collector/intel";
import { newestNewsDoc, type ReportRef } from "./newsask";

export async function incidentNewsDoc(id: string): Promise<string | null> {
  const d = (await incident(id)) as { reports?: ReportRef[] } | null;
  return newestNewsDoc(d?.reports);
}
