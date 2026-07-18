const RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isRunRouteId(value: string): boolean {
  return RUN_ID_PATTERN.test(value);
}
