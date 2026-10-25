import { notFound } from "next/navigation";
import Preview from "./Preview";

export const metadata = { title: "Ask District IQ preview · District IQ" };

/**
 * The assistant's panel on real answers (fixtures.json, written by golden/fixture.golden.ts from the frozen store), for designing
 * it without a Collector sign-in. Development only. ?theme=light|dark, ?empty=1 for the first screen.
 */
export default function DevAssistantPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Preview />;
}
