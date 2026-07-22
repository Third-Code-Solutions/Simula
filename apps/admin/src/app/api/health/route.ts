import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      environment: process.env.SIMULA_ENVIRONMENT ?? "local",
      release_sha: process.env.SIMULA_RELEASE_SHA ?? "dev",
      service: "admin",
      status: "ok",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
