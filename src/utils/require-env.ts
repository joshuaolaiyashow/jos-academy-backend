/** Reads a required environment variable, throwing immediately instead of silently defaulting. */
export function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} environment variable is not configured`);
  }

  return value;
}
