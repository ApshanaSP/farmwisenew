import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CitizenHome from "@/components/citizen/CitizenHome";
import { ComplaintStatus } from "@/types";
import pool from "@/lib/db";
import { CITIZEN_NAV, RESOLVED_STATUSES } from "@/lib/constants";
import { progressFor } from "@/lib/complaint-progress";
import { RowDataPacket } from "mysql2";

export default async function CitizenLandingPage() {
  const session = await getSessionFromCookies();
  if (!session || session.role !== "citizen") {
    redirect("/login");
  }

  const [profileRows] = await pool.query<RowDataPacket[]>(
    "SELECT first_name FROM user_profiles WHERE user_id = ?",
    [session.userId]
  );
  const firstName = profileRows[0]?.first_name as string | undefined;

  // every complaint's status as the officer's and the Collector's work left it (complaint-progress.ts)
  const [mine] = await pool.query<RowDataPacket[]>(
    `SELECT c.complaint_code, c.title, c.status, c.created_at, d.name AS department_name
     FROM complaints c
     LEFT JOIN departments d ON d.id = c.department_id
     WHERE c.user_id = ?
     ORDER BY c.created_at DESC`,
    [session.userId]
  );
  const prog = await progressFor(mine.map((c) => ({ code: String(c.complaint_code), createdAt: c.created_at }))).catch(() => new Map());
  for (const c of mine) {
    const p = prog.get(String(c.complaint_code));
    if (p) c.status = p.status;
  }
  const done = (s: string) => (RESOLVED_STATUSES as readonly string[]).includes(s);
  const stats = {
    total: mine.length,
    resolved: mine.filter((c) => done(c.status)).length,
    open: mine.filter((c) => !done(c.status) && c.status !== "Rejected").length
  };
  const recentRows = mine.slice(0, 3);

  const recent = recentRows.map((c) => ({
    code: c.complaint_code as string,
    title: c.title as string,
    status: c.status as ComplaintStatus,
    createdAt: new Date(c.created_at as string).toISOString(),
    department: (c.department_name ?? "") as string
  }));

  return (
    <div className="diq-bg flex min-h-screen flex-col">
      <Header userName={firstName || session.email} homeHref="/citizen" nav={CITIZEN_NAV} />
      <CitizenHome name={firstName ?? null} stats={stats} recent={recent} />
      <Footer />
    </div>
  );
}
