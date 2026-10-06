import { notFound } from "next/navigation";
import KitGallery from "./KitGallery";

export const metadata = { title: "UI kit · District IQ" };

/** A hidden page showing every kit component in the current theme (development only). */
export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <KitGallery />;
}
