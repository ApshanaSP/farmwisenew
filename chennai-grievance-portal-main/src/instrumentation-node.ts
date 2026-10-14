/**
 * With DATA_BACKEND=aws the district data and the accounts are downloaded from AWS when the server starts, not on the
 * first request (a sign-in on a fresh start used to wait 90 seconds for it). The build steps (derive.ts) are registered
 * first, so the first build is adjusted before it is served.
 */
import { warmUp } from "@/lib/aws/store";
import "@/lib/collector/derive";

if (process.env.DATA_BACKEND === "aws") warmUp();
