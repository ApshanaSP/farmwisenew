import { z } from "zod";

const key = z.string().min(1).max(200);

/** A field mapping as the onboarding drawer sends it back (see Mapping in sourcemap.ts). */
export const Mapping = z.object({
  title: key.nullable(),
  body: z.array(key).max(4),
  url: key.nullable(),
  published: key.nullable(),
  dateFormat: z.enum(["auto", "iso", "rfc822", "dmy", "mdy", "unix", "unix_ms"]),
  place: z.array(key).max(4),
  lat: key.nullable(),
  lon: key.nullable(),
  category: key.nullable(),
  id: key.nullable()
});
