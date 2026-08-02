import type { Metadata } from "next";

import { requireAuthenticatedPage } from "@/lib/auth";

import { CampaignEvidenceWorkspace } from "./workspace";

export const metadata: Metadata = {
  title: "Evidence lab",
};

export default async function EvidencePage({
  params,
}: Readonly<{ params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;
  await requireAuthenticatedPage(`/projects/${projectId}/evidence`);
  return <CampaignEvidenceWorkspace projectId={projectId} />;
}
