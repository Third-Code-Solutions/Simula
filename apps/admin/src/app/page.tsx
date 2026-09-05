import { AdminDashboard } from "@/components/admin-dashboard";
import {
  loadPlatformAdminDashboard,
  ADMIN_PAGE_SIZE,
  organizationOffset,
  workspaceOrigin,
} from "@/lib/platform-api";

export default async function AdminHomePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ offset?: string | string[] }>;
}>) {
  const offset = organizationOffset((await searchParams).offset);
  const { dashboard, email } = await loadPlatformAdminDashboard(offset);
  return (
    <AdminDashboard
      dashboard={dashboard}
      email={email}
      workspaceOrigin={workspaceOrigin()}
      offset={offset}
      pageSize={ADMIN_PAGE_SIZE}
      key={offset}
    />
  );
}
