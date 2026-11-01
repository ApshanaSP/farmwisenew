import ConsoleLoader from "@/components/ConsoleLoader";

/** While the server builds the console's first screen (after sign-in or a reload): the opening screen, never a blank page. */
export default function Loading() {
  return <ConsoleLoader />;
}
