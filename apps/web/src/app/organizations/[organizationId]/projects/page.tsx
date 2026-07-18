import type { Metadata } from "next";

import { requireAuthenticatedPage } from "@/lib/auth";

import { ProjectsWorkspace } from "./projects-workspace";

export const metadata: Metadata = {
  title: "Projects",
};

export default async function ProjectsPage({
  params,
}: Readonly<{ params: Promise<{ organizationId: string }> }>) {
  const { organizationId } = await params;
  await requireAuthenticatedPage(`/organizations/${organizationId}/projects`);
  return <ProjectsWorkspace organizationId={organizationId} />;
}
