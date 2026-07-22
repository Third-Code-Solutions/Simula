import { AdminDashboard } from "@/components/admin-dashboard";
import {
  loadPlatformAdminDashboard,
  workspaceOrigin,
} from "@/lib/platform-api";

export default async function AdminHomePage() {
  const { dashboard, email } = await loadPlatformAdminDashboard();
  return (
    <AdminDashboard
      dashboard={dashboard}
      email={email}
      workspaceOrigin={workspaceOrigin()}
    />
  );
}
