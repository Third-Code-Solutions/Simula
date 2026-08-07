import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function releaseSha(): string {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.SIMULA_RELEASE_SHA?.trim() ||
    "dev"
  );
}

export function GET() {
  return NextResponse.json(
    {
      environment: process.env.SIMULA_ENVIRONMENT ?? "local",
      release_sha: releaseSha(),
      service: "admin",
      status: "ok",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
