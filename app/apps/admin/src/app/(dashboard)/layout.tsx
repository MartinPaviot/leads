import { AdminNav } from "../../components/admin-nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AdminNav />
      <main className="flex-1 overflow-auto p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
