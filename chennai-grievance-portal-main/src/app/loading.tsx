import ConsoleLoader from "@/components/ConsoleLoader";

/** While the server builds any page without a loading screen of its own: says what is happening, never a blank page. */
export default function Loading() {
  return <ConsoleLoader page />;
}
