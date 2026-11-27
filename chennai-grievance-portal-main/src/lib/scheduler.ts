/**
 * Background jobs of this server, started once when it starts (instrumentation-node.ts): added sources whose refresh
 * interval has passed are fetched (runDueSources, which includes the live lane's news feeds every 10 minutes), the
 * IMD warning for Chennai is read every 10 minutes (lib/live/imd.ts), Data Studio links that refresh on their own are re-read
 * (runDueRefreshes), and the Collector's follow-ups the department has answered are closed (lib/officer/followups.ts). Pages used to start these sweeps from GET requests, so reading the console changed data; now a
 * read is only a read. Each sweep checks every minute and skips itself when one ran less than a minute ago.
 */
declare global {
  // eslint-disable-next-line no-var
  var __districtIqJobs: NodeJS.Timeout | undefined;
}

const EVERY_MS = 60_000;

export function startJobs(): void {
  if (global.__districtIqJobs || process.env.DISTRICT_IQ_JOBS === "off") return;
  const tick = async () => {
    try {
      // loaded on the first tick, not at start-up: the sources and studio modules are large
      const [{ runDueSources }, { runDueRefreshes, runDueConnectors }] = await Promise.all([import("@/lib/collector/sources"), import("@/lib/studio/pipeline")]);
      runDueSources();
      // the live lane's IMD warning: read every 10 minutes, laid over the hourly build in memory (lib/live/imd.ts); on its
      // own, so loading it or a slow IMD site never holds up the other jobs
      void import("@/lib/live/imd").then((m) => m.liveImdTick()).catch((e) => console.warn(`[jobs] live IMD skipped: ${(e as Error).message}`));
      // the news desk: AI reads each new news story once, so the Collector sees only what is the administration's business (newsdesk.ts)
      void import("@/lib/collector/newsdesk").then((m) => m.deskTick()).catch((e) => console.warn(`[jobs] news desk skipped: ${(e as Error).message}`));
      // v18 round 2 (24 Nov): live traffic kept, a reading every 10 minutes (lib/city/history.ts): TomTom keeps no history, and the Collector asks
      // "the most congested roads over the last 30 days"; on its own, so a slow TomTom never holds up the other jobs
      if (process.env.TRAFFIC_HISTORY !== "off") void import("@/lib/city/history").then((m) => m.recordTraffic()).catch((e) => console.warn(`[jobs] traffic reading skipped: ${(e as Error).message}`));
      runDueRefreshes();
      // Data Studio's Live Connectors: each at its own time (IST), missed runs caught up once
      runDueConnectors();
      // the Collector's follow-ups the department has answered (a report, a send, its own close) are closed, every 5 minutes; what stays
      // pending past its due date is what the Collector's department pop-up lists as late (lib/officer/followups.ts)
      void import("@/lib/officer/followups").then((m) => m.followupsTick()).catch((e) => console.warn(`[jobs] follow-ups skipped: ${(e as Error).message}`));
      // an SMS to a petitioner that failed gets another try
      void (await import("@/lib/manu/sms")).retryFailedSms();
    } catch (e) {
      console.warn(`[jobs] sweep skipped: ${(e as Error).message}`);
    }
  };
  // the first sweep waits a minute, so the district data has loaded
  global.__districtIqJobs = setInterval(() => void tick(), EVERY_MS);
  global.__districtIqJobs.unref?.();
}
