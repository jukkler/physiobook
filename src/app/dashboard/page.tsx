import { redirect } from "next/navigation";
import { verifySessionFromCookies } from "@/lib/auth";
import DashboardClient from "@/components/DashboardClient";

export default async function DashboardPage() {
  const session = await verifySessionFromCookies();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">PhysioBook</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{session.username}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-4">
        <DashboardClient />
      </main>
    </div>
  );
}

function LogoutButton() {
  return (
    <form
      action={async () => {
        "use server";
        const { cookies } = await import("next/headers");
        const cookieStore = await cookies();
        cookieStore.delete("physiobook_session");
        redirect("/login");
      }}
    >
      <button
        type="submit"
        className="text-sm text-gray-600 hover:text-gray-900 underline"
      >
        Abmelden
      </button>
    </form>
  );
}
