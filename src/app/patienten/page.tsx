import Link from "next/link";
import { redirect } from "next/navigation";
import { verifySessionFromCookies } from "@/lib/auth";
import PatientenClient from "@/components/PatientenClient";
import UserMenu from "@/components/UserMenu";

export default async function PatientenPage() {
  const session = await verifySessionFromCookies();
  if (!session) redirect("/login");

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard"><img src="/logo.svg" alt="Therapiezentrum Ziesemer" className="h-8" /></Link>
            <h1 className="text-xl font-bold text-gray-900">Patienten</h1>
          </div>
          <div className="flex items-center gap-4">
            <UserMenu
              username={session.username}
              navItems={[
                { label: "Kalender", href: "/dashboard" },
                { label: "Verwaltung", href: "/verwaltung" },
              ]}
            />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full">
        <PatientenClient />
      </main>
    </div>
  );
}
