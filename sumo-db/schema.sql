PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS basho_metadata (
    basho_code           TEXT PRIMARY KEY,
    basho_year           INTEGER NOT NULL,
    basho_month          INTEGER NOT NULL,
    source_url           TEXT NOT NULL,
    raw_html_path        TEXT,
    fetched_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    http_status          INTEGER,
    parse_status         TEXT NOT NULL,
    error_message        TEXT
);

CREATE INDEX IF NOT EXISTS idx_basho_metadata_year_month
    ON basho_metadata(basho_year, basho_month);

CREATE TABLE IF NOT EXISTS basho_banzuke_entry (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    basho_code           TEXT NOT NULL,
    rikishi_id           INTEGER,
    division             TEXT NOT NULL,
    basho_rank_index     INTEGER NOT NULL,
    division_rank_index  INTEGER NOT NULL,
    basho_rank_value     REAL NOT NULL,
    slot_rank_value      REAL NOT NULL,
    side                 TEXT NOT NULL,
    rank_name            TEXT NOT NULL,
    rank_number          INTEGER NOT NULL,
    is_haridashi         INTEGER NOT NULL DEFAULT 0,
    banzuke_label        TEXT NOT NULL,
    shikona              TEXT,
    raw_line             TEXT NOT NULL,
    FOREIGN KEY (basho_code) REFERENCES basho_metadata(basho_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_basho_banzuke_entry_unique_slot
    ON basho_banzuke_entry(basho_code, division, side, rank_name, rank_number, is_haridashi);

CREATE INDEX IF NOT EXISTS idx_basho_banzuke_entry_basho
    ON basho_banzuke_entry(basho_code);

CREATE INDEX IF NOT EXISTS idx_basho_banzuke_entry_rikishi_id
    ON basho_banzuke_entry(rikishi_id);

CREATE INDEX IF NOT EXISTS idx_basho_banzuke_entry_shikona
    ON basho_banzuke_entry(shikona);

CREATE TABLE IF NOT EXISTS rikishi_discovery_catalog (
    rikishi_id           INTEGER PRIMARY KEY,
    discovery_source     TEXT NOT NULL,
    first_seen_basho_code TEXT NOT NULL,
    last_seen_basho_code TEXT NOT NULL,
    fetch_state          TEXT NOT NULL,
    cohort_state         TEXT NOT NULL,
    cohort_reason        TEXT,
    source_url           TEXT,
    raw_html_path        TEXT,
    http_status          INTEGER,
    content_hash         TEXT,
    debut_basho          TEXT,
    last_basho           TEXT,
    highest_rank_raw     TEXT,
    highest_rank_name    TEXT,
    career_wins          INTEGER,
    career_losses        INTEGER,
    career_absences      INTEGER,
    career_appearances   INTEGER,
    career_bashos        INTEGER,
    last_attempted_at    TEXT,
    attempt_count        INTEGER NOT NULL DEFAULT 0,
    included_at          TEXT,
    excluded_at          TEXT,
    error_message        TEXT,
    updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rikishi_discovery_fetch_state
    ON rikishi_discovery_catalog(fetch_state);

CREATE INDEX IF NOT EXISTS idx_rikishi_discovery_cohort_state
    ON rikishi_discovery_catalog(cohort_state);

CREATE INDEX IF NOT EXISTS idx_rikishi_discovery_seen_range
    ON rikishi_discovery_catalog(first_seen_basho_code, last_seen_basho_code);

CREATE TABLE IF NOT EXISTS rikishi_summary (
    rikishi_id           INTEGER PRIMARY KEY,
    cohort               TEXT NOT NULL,
    shikona              TEXT,
    highest_rank_raw     TEXT,
    highest_rank_name    TEXT,
    debut_basho          TEXT,
    last_basho           TEXT,
    career_wins          INTEGER,
    career_losses        INTEGER,
    career_absences      INTEGER,
    career_appearances   INTEGER,
    career_bashos        INTEGER,
    status               TEXT NOT NULL DEFAULT 'ok',
    error_message        TEXT,
    updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rikishi_summary_cohort
    ON rikishi_summary(cohort);

CREATE INDEX IF NOT EXISTS idx_rikishi_summary_highest_rank_name
    ON rikishi_summary(highest_rank_name);

CREATE INDEX IF NOT EXISTS idx_rikishi_summary_status
    ON rikishi_summary(status);

CREATE TABLE IF NOT EXISTS rank_movement (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    rikishi_id            INTEGER,
    shikona               TEXT NOT NULL,
    from_basho_code       TEXT NOT NULL,
    to_basho_code         TEXT NOT NULL,
    from_division         TEXT NOT NULL,
    to_division           TEXT NOT NULL,
    from_banzuke_label    TEXT NOT NULL,
    to_banzuke_label      TEXT NOT NULL,
    from_basho_rank_index INTEGER NOT NULL,
    to_basho_rank_index   INTEGER NOT NULL,
    from_basho_rank_value REAL NOT NULL,
    to_basho_rank_value   REAL NOT NULL,
    from_slot_rank_value  REAL NOT NULL,
    to_slot_rank_value    REAL NOT NULL,
    movement_steps        REAL NOT NULL,
    movement_label        TEXT NOT NULL,
    FOREIGN KEY (from_basho_code) REFERENCES basho_metadata(basho_code),
    FOREIGN KEY (to_basho_code) REFERENCES basho_metadata(basho_code)
);

CREATE INDEX IF NOT EXISTS idx_rank_movement_rikishi_id
    ON rank_movement(rikishi_id);

CREATE INDEX IF NOT EXISTS idx_rank_movement_shikona
    ON rank_movement(shikona);

CREATE INDEX IF NOT EXISTS idx_rank_movement_from_to
    ON rank_movement(from_basho_code, to_basho_code);

CREATE INDEX IF NOT EXISTS idx_rank_movement_steps
    ON rank_movement(movement_steps);

CREATE TABLE IF NOT EXISTS rikishi_basho_record (
    rikishi_id            INTEGER NOT NULL,
    basho_code            TEXT NOT NULL,
    shikona               TEXT,
    division              TEXT NOT NULL,
    rank_name             TEXT,
    rank_number           INTEGER,
    side                  TEXT,
    is_haridashi          INTEGER NOT NULL DEFAULT 0,
    banzuke_label         TEXT,
    record_raw            TEXT,
    wins                  INTEGER NOT NULL DEFAULT 0,
    losses                INTEGER NOT NULL DEFAULT 0,
    absences              INTEGER NOT NULL DEFAULT 0,
    yusho_text            TEXT,
    sansho_text           TEXT,
    kinboshi_count        INTEGER NOT NULL DEFAULT 0,
    source_url            TEXT,
    raw_html_path         TEXT,
    parse_status          TEXT NOT NULL DEFAULT 'ok',
    error_message         TEXT,
    updated_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (rikishi_id, basho_code),
    FOREIGN KEY (basho_code) REFERENCES basho_metadata(basho_code)
);

CREATE INDEX IF NOT EXISTS idx_rikishi_basho_record_basho
    ON rikishi_basho_record(basho_code);

CREATE INDEX IF NOT EXISTS idx_rikishi_basho_record_division
    ON rikishi_basho_record(division, rank_name, rank_number);

CREATE INDEX IF NOT EXISTS idx_rikishi_basho_record_status
    ON rikishi_basho_record(parse_status);

CREATE VIEW IF NOT EXISTS rank_movement_with_record AS
SELECT
    rm.id,
    rm.rikishi_id,
    rm.shikona,
    rm.from_basho_code,
    rm.to_basho_code,
    rm.from_division,
    rm.to_division,
    rm.from_banzuke_label,
    rm.to_banzuke_label,
    rm.from_basho_rank_index,
    rm.to_basho_rank_index,
    rm.from_basho_rank_value,
    rm.to_basho_rank_value,
    rm.from_slot_rank_value,
    rm.to_slot_rank_value,
    rm.movement_steps,
    rm.movement_label,
    rbr.division AS source_record_division,
    rbr.rank_name AS source_rank_name,
    rbr.rank_number AS source_rank_number,
    rbr.side AS source_side,
    rbr.is_haridashi AS source_is_haridashi,
    rbr.banzuke_label AS source_banzuke_label,
    rbr.record_raw AS source_record_raw,
    rbr.wins AS source_wins,
    rbr.losses AS source_losses,
    rbr.absences AS source_absences,
    rbr.yusho_text AS source_yusho_text,
    rbr.sansho_text AS source_sansho_text,
    rbr.kinboshi_count AS source_kinboshi_count,
    rbr.parse_status AS source_parse_status,
    rbr.error_message AS source_error_message
FROM rank_movement rm
LEFT JOIN rikishi_basho_record rbr
    ON rbr.rikishi_id = rm.rikishi_id
   AND rbr.basho_code = rm.from_basho_code;

CREATE TABLE IF NOT EXISTS etl_state (
    key                  TEXT PRIMARY KEY,
    value                TEXT NOT NULL,
    updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
