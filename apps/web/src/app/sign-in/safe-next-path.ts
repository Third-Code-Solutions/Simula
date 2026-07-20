const DEFAULT_POST_AUTH_PATH = "/organizations";
const PROTECTED_PATHS = /^\/(?:organizations|projects|runs)(?:\/|$)/;
const UNSAFE_PATH_CHARACTERS = /[\\\u0000-\u001f\u007f%]/;

export function safeNextPath(value: string | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    UNSAFE_PATH_CHARACTERS.test(value) ||
    !PROTECTED_PATHS.test(value)
  ) {
    return DEFAULT_POST_AUTH_PATH;
  }

  const destination = new URL(value, "https://simula.invalid");
  if (
    destination.origin !== "https://simula.invalid" ||
    destination.pathname !== value ||
    destination.search ||
    destination.hash
  ) {
    return DEFAULT_POST_AUTH_PATH;
  }
  return destination.pathname;
}
