import Link from "next/link";
import { redirect } from "next/navigation";
import { verifySessionFromCookies } from "@/lib/auth";
import DashboardClient from "@/components/DashboardClient";
import UserMenu from "@/components/UserMenu";

export default async function DashboardPage() {
  const session = await verifySessionFromCookies();
  if (!session) redirect("/login");

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard"><img src="/logo.svg" alt="Therapiezentrum Ziesemer" className="h-8" /></Link>
            <h1 className="text-xl font-bold text-gray-900">Kalender</h1>
          </div>
          <div className="flex items-center gap-4">
            <div id="header-search-portal" />
            <div id="header-mailbox-portal" />
            <div id="header-toggle-portal" />
            <UserMenu
              username={session.username}
              navItems={[
                { label: "Verwaltung", href: "/verwaltung" },
                { label: "Patienten", href: "/patienten" },
              ]}
            />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-4 flex-1 min-h-0 flex flex-col w-full">
        <DashboardClient />
      </main>
    </div>
  );
}
