import { notFound } from "next/navigation";

export const metadata = { title: "Ask District IQ preview · District IQ" };

/**
 * The assistant's panel on real answers (fixtures.json, written by golden/fixture.golden.ts from the frozen store), for designing
 * it without a Collector sign-in. Development only. ?theme=light|dark, ?empty=1 for the first screen.
 *
 * The preview and its fixtures are imported only inside the development branch. The build folds process.env.NODE_ENV to a constant
 * and drops the dead branch with its import(), so a production build never compiles the fixtures (real Collector answers: counts,
 * office addresses, incident ids) into a public static chunk. notFound() alone stopped the render, not the chunk the build emitted
 * for a statically imported client component (hunt2-sec-13, redsec2-12).
 */
export default async function DevAssistantPage() {
  if (process.env.NODE_ENV !== "production") {
    const { default: Preview } = await import("./Preview");
    return <Preview />;
  }
  notFound();
}
