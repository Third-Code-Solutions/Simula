import type { Metadata } from "next";

import { requireAuthenticatedPage } from "@/lib/auth";

import { MethodologyWorkspace } from "./workspace";

export const metadata: Metadata = {
  title: "Methodology lab",
};

export default async function MethodologyPage({
  params,
}: Readonly<{ params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;
  await requireAuthenticatedPage(`/projects/${projectId}/methodology`);
  return <MethodologyWorkspace projectId={projectId} />;
}
