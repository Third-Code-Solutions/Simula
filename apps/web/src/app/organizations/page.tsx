import { requireAuthenticatedPage } from "@/lib/auth";

import { OrganizationsWorkspace } from "./organizations-workspace";

export default async function OrganizationsPage() {
  await requireAuthenticatedPage("/organizations");
  return <OrganizationsWorkspace />;
}
