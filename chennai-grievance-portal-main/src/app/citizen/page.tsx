import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CitizenHome from "@/components/citizen/CitizenHome";
import { ComplaintStatus } from "@/types";
import pool from "@/lib/db";
import { CITIZEN_NAV } from "@/lib/constants";
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

  const [statRows] = await pool.query<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'Verified by Collector') AS resolved,
       SUM(status NOT IN ('Verified by Collector', 'Rejected')) AS open
     FROM complaints WHERE user_id = ?`,
    [session.userId]
  );
  const stats = {
    total: Number(statRows[0]?.total ?? 0),
    resolved: Number(statRows[0]?.resolved ?? 0),
    open: Number(statRows[0]?.open ?? 0)
  };

  const [recentRows] = await pool.query<RowDataPacket[]>(
    `SELECT c.complaint_code, c.title, c.status, c.created_at, d.name AS department_name
     FROM complaints c
     JOIN departments d ON d.id = c.department_id
     WHERE c.user_id = ?
     ORDER BY c.created_at DESC
     LIMIT 3`,
    [session.userId]
  );

  const recent = recentRows.map((c) => ({
    code: c.complaint_code as string,
    title: c.title as string,
    status: c.status as ComplaintStatus,
    createdAt: new Date(c.created_at as string).toISOString(),
    department: c.department_name as string
  }));

  return (
    <div className="diq-bg flex min-h-screen flex-col">
      <Header userName={firstName || session.email} homeHref="/citizen" nav={CITIZEN_NAV} />
      <CitizenHome name={firstName ?? null} stats={stats} recent={recent} />
      <Footer />
    </div>
  );
}
