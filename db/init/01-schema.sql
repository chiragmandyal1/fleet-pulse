-- Telemetry schema. Runs once, on first container start.
--
-- Why a hypertable: telemetry is append-only and always queried by time range.
-- A hypertable transparently shards the table into per-time-range chunks, so a
-- query for "last 6 hours" touches one or two chunks instead of scanning the
-- whole table, and the index stays small enough to matter as rows accumulate.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE telemetry (
    time        TIMESTAMPTZ      NOT NULL,
    device_id   TEXT             NOT NULL,
    online      BOOLEAN          NOT NULL,
    -- Mbps. NULL while the device is offline: no reading is not the same as zero.
    bandwidth   DOUBLE PRECISION,
    -- dB. Same reasoning.
    rf_signal   DOUBLE PRECISION
);

SELECT create_hypertable('telemetry', by_range('time', INTERVAL '1 day'));

-- Every dashboard query filters by device and orders by time, so lead with both.
CREATE INDEX telemetry_device_time_idx ON telemetry (device_id, time DESC);

-- Compress chunks older than a week. Telemetry is never updated once written,
-- which is exactly the case columnar compression is built for.
ALTER TABLE telemetry SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('telemetry', INTERVAL '7 days');

-- Continuous aggregate: the dashboard's online/offline trend chart reads this
-- instead of raw rows. Timescale keeps it current incrementally, so the chart
-- cost stays flat no matter how much telemetry has piled up.
CREATE MATERIALIZED VIEW telemetry_5min
WITH (timescaledb.continuous) AS
SELECT
    time_bucket(INTERVAL '5 minutes', time) AS bucket,
    device_id,
    -- Averaged over the bucket, this is availability for that window.
    avg(online::int)                        AS availability,
    avg(bandwidth)                          AS avg_bandwidth,
    avg(rf_signal)                          AS avg_rf_signal,
    count(*)                                AS samples
FROM telemetry
GROUP BY bucket, device_id
WITH NO DATA;

-- Real-time: buckets the policy hasn't materialised yet are computed from raw
-- rows at query time, so the newest point on the chart is never 5+ minutes stale.
ALTER MATERIALIZED VIEW telemetry_5min SET (timescaledb.materialized_only = false);

-- The policy only refreshes inside [now - start_offset, now - end_offset].
-- Six days, not one hour, so backfilled history (--backfill 6h) gets
-- materialised too; only buckets invalidated by new writes are recomputed, so
-- the wide window costs nothing on a quiet run. Kept under the 7-day
-- compression age so a refresh never has to read compressed chunks.
SELECT add_continuous_aggregate_policy('telemetry_5min',
    start_offset => INTERVAL '6 days',
    end_offset   => INTERVAL '5 minutes',
    schedule_interval => INTERVAL '5 minutes');

-- Online/offline transitions, detected at ingest. Disconnection reports pair
-- these up instead of scanning every raw sample: 300 devices at one sample per
-- 5s is ~5M telemetry rows a day, against roughly ten thousand events.
CREATE TABLE link_events (
    time      TIMESTAMPTZ NOT NULL,
    device_id TEXT        NOT NULL,
    online    BOOLEAN     NOT NULL
);

SELECT create_hypertable('link_events', by_range('time', INTERVAL '7 days'));

CREATE INDEX link_events_device_time_idx ON link_events (device_id, time DESC);

-- Retention, so a server that runs for months never fills its disk: everything
-- goes after 30 days, which is also the longest window the app can show. Raw
-- samples (about 5M rows a day) are the bulk of it. Safe with the aggregate
-- above: its refresh window (6 days) never reaches back as far as the data
-- being dropped.
SELECT add_retention_policy('telemetry', INTERVAL '30 days');
SELECT add_retention_policy('telemetry_5min', INTERVAL '30 days');
SELECT add_retention_policy('link_events', INTERVAL '30 days');
