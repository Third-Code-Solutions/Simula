import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isRunRouteId } from "@/features/runs/run-route";
import { RunWorkspace } from "@/features/runs/run-workspace";
import { requireAuthenticatedPage } from "@/lib/auth";
import { resultExperienceEnabled } from "@/lib/runtime";

export const metadata: Metadata = {
  title: "Run result",
};

export default async function RunPage({
  params,
}: Readonly<{ params: Promise<{ runId: string }> }>) {
  const { runId } = await params;
  if (!isRunRouteId(runId)) {
    notFound();
  }
  await requireAuthenticatedPage(`/runs/${runId}`);
  return (
    <RunWorkspace
      resultExperienceEnabled={resultExperienceEnabled()}
      runId={runId}
    />
  );
}
