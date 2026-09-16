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
});
