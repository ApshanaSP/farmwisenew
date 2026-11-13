"use client";
/** The petition officer's whole console: this login opens the Manu Desk and nothing else. */
import ManuDesk from "./ManuDesk";
import "./manu.css";

export default function ManuCounter({ user }: { user: string }) {
  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; };
  return (
    <div className="mn-page">
      <header className="mn-band">
        <div><h1 className="mn-title">Manu Desk</h1><span>மனு · Collector&apos;s Office, Chennai</span></div>
        <div className="mn-who"><span>{user.split("@")[0]}</span><button onClick={() => void signOut()}>Sign out</button></div>
      </header>
      <ManuDesk />
    </div>
  );
}
