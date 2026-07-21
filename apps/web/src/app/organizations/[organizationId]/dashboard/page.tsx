import type { Metadata } from "next";

import { requireAuthenticatedPage } from "@/lib/auth";

import { OrganizationDashboardWorkspace } from "./organization-dashboard";

export const metadata: Metadata = {
  title: "Organization dashboard",
};

export default async function OrganizationDashboardPage({
  params,
}: Readonly<{ params: Promise<{ organizationId: string }> }>) {
  const { organizationId } = await params;
  await requireAuthenticatedPage(`/organizations/${organizationId}/dashboard`);
  return <OrganizationDashboardWorkspace organizationId={organizationId} />;
}
