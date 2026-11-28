"use client";
/**
 * The petition officer's whole console: this login opens the Manu Desk and nothing else. Since 28 Nov it wears the consoles' own
 * look (owner: "for Manu also change the UI layout the same as the Collector console"): the shared white top bar (brand, place,
 * helpline, English / தமிழ், theme, account with sign-out), the green band with the desk's counts, and the work in cards.
 */
import Header from "@/components/Header";
import ManuDesk from "./ManuDesk";
import "@/components/citizen/citizen.css";
import "./manu.css";

export default function ManuCounter({ user }: { user: string }) {
  return (
    <div className="diq-bg flex min-h-screen flex-col mn-page">
      <Header userName={user.split("@")[0]} homeHref="/officer" sub="Manu Desk · Collector's Office" />
      <h1 className="sr-only">Manu Desk</h1>
      <main className="cz-body mn-body"><ManuDesk band /></main>
    </div>
  );
}
