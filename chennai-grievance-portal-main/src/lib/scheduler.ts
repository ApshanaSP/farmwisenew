/**
 * Background jobs of this server, started once when it starts (instrumentation-node.ts): added sources whose refresh
 * interval has passed are fetched (runDueSources, which includes the live lane's news feeds every 10 minutes), the
 * IMD warning for Chennai is read every 10 minutes (lib/live/imd.ts), and Data Studio links that refresh on their own are re-read
 * (runDueRefreshes). Pages used to start these sweeps from GET requests, so reading the console changed data; now a
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
      runDueRefreshes();
      // Data Studio's Live Connectors: each at its own time (IST), missed runs caught up once
      runDueConnectors();
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
