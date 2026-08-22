import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isOwnerSession } from "@/lib/owner";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  if (!isOwnerSession(session)) notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4 lg:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
              TransitFlow · internal
            </p>
            <p className="text-xl font-bold text-gray-900">Admin</p>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:border-gray-300 hover:text-gray-900"
            >
              Dashboard
            </Link>
            <Link
              href="/admin/gtfs"
              className="inline-flex items-center rounded-lg bg-[#007A33] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#005f28]"
            >
              GTFS pipeline
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
