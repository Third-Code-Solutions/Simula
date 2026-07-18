import type { Metadata } from "next";

import { requireAuthenticatedPage } from "@/lib/auth";

import { OrganizationsWorkspace } from "./organizations-workspace";

export const metadata: Metadata = {
  title: "Organizations",
};

export default async function OrganizationsPage() {
  await requireAuthenticatedPage("/organizations");
  return <OrganizationsWorkspace />;
}
