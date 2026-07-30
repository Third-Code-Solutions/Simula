import type { Metadata } from "next";

import { requireAuthenticatedPage } from "@/lib/auth";
import {
  behavioralDemoEnabled,
  privateAssetWorkflowEnabled,
  technicalVisualProfileEnabled,
} from "@/lib/runtime";

import { ProjectWorkspace } from "./project-workspace";

export const metadata: Metadata = {
  title: "Project workspace",
};

export default async function ProjectPage({
  params,
}: Readonly<{ params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;
  await requireAuthenticatedPage(`/projects/${projectId}`);
  return (
    <ProjectWorkspace
      behavioralDemoEnabled={behavioralDemoEnabled()}
      privateAssetWorkflowEnabled={privateAssetWorkflowEnabled()}
      projectId={projectId}
      technicalVisualProfileEnabled={technicalVisualProfileEnabled()}
    />
  );
}
