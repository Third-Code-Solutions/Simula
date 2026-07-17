import { runtimeMetadata } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    {
      ...runtimeMetadata(),
      status: "ok",
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
