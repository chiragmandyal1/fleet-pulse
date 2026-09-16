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

SELECT add_continuous_aggregate_policy('telemetry_5min',
    start_offset => INTERVAL '1 hour',
    end_offset   => INTERVAL '5 minutes',
    schedule_interval => INTERVAL '5 minutes');
