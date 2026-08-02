import type { Metadata } from "next";

import { requireAuthenticatedPage } from "@/lib/auth";

import { CampaignLabWorkspace } from "./workspace";

export const metadata: Metadata = {
  title: "Campaign Simulation Lab",
};

export default async function CampaignLabPage({
  params,
}: Readonly<{ params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;
  await requireAuthenticatedPage(`/projects/${projectId}/campaign-lab`);
  return <CampaignLabWorkspace projectId={projectId} />;
}
