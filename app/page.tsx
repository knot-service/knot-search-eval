import { cookies } from "next/headers";
import { verifySession } from "../lib/auth";
import { Dashboard, Login } from "../components/Dashboard";
export const dynamic = "force-dynamic";
export default async function Home() {
  const c = await cookies();
  return verifySession(
    c.get("knot_eval_session")?.value,
    process.env.SESSION_SECRET,
  ) ? (
    <Dashboard />
  ) : (
    <Login />
  );
}
