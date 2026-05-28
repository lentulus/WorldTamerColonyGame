function require_env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const Config = {
  port:         Number(process.env.PORT ?? 3001),
  meridianData: require_env('MERIDIAN_DATA', '/Volumes/Lexar/MeridianData'),
  colonyDb:     require_env('COLONY_DB',     '/Users/lentulus/databases/worldtamer.db'),
} as const;
