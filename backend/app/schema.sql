CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS road_segment (
    id text PRIMARY KEY,
    osm_id bigint,
    road_name text,
    road_class text,
    length_km double precision NOT NULL,
    direction text,
    geom geometry(LineString, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS road_segment_geom_idx ON road_segment USING gist (geom);

CREATE TABLE IF NOT EXISTS traffic_observation (
    segment_id text NOT NULL REFERENCES road_segment (id),
    provider text NOT NULL,
    observed_at timestamptz NOT NULL,
    speed_kmh double precision,
    free_flow_speed_kmh double precision,
    confidence double precision,
    PRIMARY KEY (segment_id, provider, observed_at)
);
CREATE INDEX IF NOT EXISTS traffic_observation_time_idx ON traffic_observation (observed_at);
