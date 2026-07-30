const RATE_KEY_SCHEMA = "s2";

export function organizationCachePatterns(
  keyPrefix: string,
  organizationId: string,
): readonly string[] {
  const prefix = `${keyPrefix}:${RATE_KEY_SCHEMA}`;
  return Object.freeze([
    `${prefix}:organization_mutation:user:*:${organizationId}`,
    `${prefix}:organization_mutation:user:*:${organizationId}:idempotency:*`,
    `${prefix}:run_create_organization:organization:${organizationId}`,
    `${prefix}:run_create:organization:${organizationId}:idempotency:*`,
    `${prefix}:run_cancel:user:*:${organizationId}`,
  ]);
}
