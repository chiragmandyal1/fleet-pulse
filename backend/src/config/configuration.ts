/**
 * Dev defaults keep `npm run start:dev` zero-config. In production a missing
 * secret is a startup error, not a silently guessable default.
 */
function secret(name: string, devDefault: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') throw new Error(`${name} must be set in production`);
  return devDefault;
}

export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  timescale: {
    host: process.env.TIMESCALE_HOST ?? 'localhost',
    // 5433, not 5432: the compose file maps it off the default so it cannot
    // collide with a Postgres already running on the host.
    port: parseInt(process.env.TIMESCALE_PORT ?? '5433', 10),
    user: process.env.TIMESCALE_USER ?? 'fleetpulse',
    password: process.env.TIMESCALE_PASSWORD ?? 'fleetpulse',
    database: process.env.TIMESCALE_DB ?? 'fleetpulse',
  },
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27018/fleetpulse',
  jwt: {
    secret: secret('JWT_SECRET', 'dev-only-jwt-secret'),
    expiresInSec: 8 * 3600,
  },
  /** Shared key the simulator sends; ingestion is machine-to-machine, so no JWT. */
  ingestKey: secret('INGEST_KEY', 'dev-ingest-key'),
  /** Password for the seeded demo accounts. */
  demoPassword: process.env.DEMO_PASSWORD ?? 'fleetpulse',
});
