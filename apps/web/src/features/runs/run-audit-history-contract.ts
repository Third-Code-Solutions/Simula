import { z } from "zod";

import { runStateSchema } from "./result-contract";

const UUID = z.string().uuid();
const TIMESTAMP = z.string().datetime({ offset: true });
const DISCLOSURE =
  "Run state evidence only. Actor identities, payloads, prompts, agent memory, rationale, and free-form metadata are excluded." as const;

const runAuditEventSchema = z
  .object({
    event_id: UUID,
    previous_state: runStateSchema.nullable(),
    new_state: runStateSchema,
    attempt_number: z.number().int().min(1).max(3).nullable(),
    safe_reason: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,63}$/)
      .nullable(),
    actor_type: z.enum(["user", "worker", "system"]),
    correlation_id: UUID,
    created_at: TIMESTAMP,
  })
  .strict();

const runAuditHistorySchema = z
  .object({
    run_id: UUID,
    events: z.array(runAuditEventSchema).min(1).max(50),
    disclosure: z.literal(DISCLOSURE),
  })
  .strict()
  .superRefine((history, context) => {
    const eventIds = new Set<string>();
    let previousTime = Number.POSITIVE_INFINITY;
    for (const [index, event] of history.events.entries()) {
      const eventTime = Date.parse(event.created_at);
      if (eventIds.has(event.event_id) || eventTime > previousTime) {
        context.addIssue({
          code: "custom",
          message: "run audit history must be unique and newest first",
          path: ["events", index],
        });
      }
      eventIds.add(event.event_id);
      previousTime = eventTime;
    }
  });

export type RunAuditHistory = z.infer<typeof runAuditHistorySchema>;

export function parseRunAuditHistory(
  value: unknown,
  expectedRunId: string,
): RunAuditHistory {
  const parsed = runAuditHistorySchema.safeParse(value);
  if (!parsed.success || parsed.data.run_id !== expectedRunId) {
    throw new Error("invalid run audit history API contract");
  }
  return parsed.data;
}
