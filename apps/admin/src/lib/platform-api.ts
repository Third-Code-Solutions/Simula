import type { components } from "@simula/contracts";
import { redirect } from "next/navigation";

import { getServerSupabaseClient } from "@/lib/supabase/server";

export type PlatformAdminDashboard =
  components["schemas"]["PlatformAdminDashboardResponse"];

function apiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SIMULA_API_URL;
  if (!raw) {
    throw new Error("SIMULA API is not configured for the admin application.");
  }
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SIMULA API origin is invalid.");
  }
  return url.origin;
}

export function workspaceOrigin(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SIMULA_WEB_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

export async function loadPlatformAdminDashboard(): Promise<{
  dashboard: PlatformAdminDashboard;
  email: string;
}> {
  const supabase = await getServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.email) {
    redirect("/sign-in");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    redirect("/sign-in");
  }

  const response = await fetch(
    `${apiOrigin()}/api/v1/platform-admin/dashboard?organization_limit=100`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json, application/problem+json",
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (response.status === 401) redirect("/sign-in");
  if (response.status === 403) redirect("/unauthorized");
  if (!response.ok) {
    throw new Error(`Platform API failed with status ${response.status}.`);
  }

  return {
    dashboard: (await response.json()) as PlatformAdminDashboard,
    email: userData.user.email,
  };
}
