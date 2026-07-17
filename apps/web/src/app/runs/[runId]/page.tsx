import { RunWorkspace } from "@/features/runs/run-workspace";
import { requireAuthenticatedPage } from "@/lib/auth";

export default async function RunPage({
  params,
}: Readonly<{ params: Promise<{ runId: string }> }>) {
  const { runId } = await params;
  await requireAuthenticatedPage(`/runs/${runId}`);
  return <RunWorkspace runId={runId} />;
}
