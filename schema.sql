-- Views and clones (both have per-day timestamps from GitHub)
CREATE TABLE repo_daily_metrics (
    id        BIGSERIAL PRIMARY KEY,
    repo      TEXT NOT NULL,           -- e.g. 'youruser/repo1'
    date      DATE NOT NULL,
    metric    TEXT NOT NULL,           -- 'views' or 'clones'
    count     INTEGER NOT NULL,        -- total count that day
    uniques   INTEGER NOT NULL,        -- unique visitors/cloners that day
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (repo, date, metric)
);

CREATE INDEX idx_repo_daily_metrics_repo_date ON repo_daily_metrics (repo, date);

-- Referrers (rolling 14-day snapshot, no per-day breakdown from GitHub —
-- 'date' here is the date the snapshot was taken, not the traffic date)
CREATE TABLE repo_referrers (
    id        BIGSERIAL PRIMARY KEY,
    repo      TEXT NOT NULL,
    date      DATE NOT NULL,           -- snapshot date
    referrer  TEXT NOT NULL,           -- e.g. 'google.com', 'github.com'
    count     INTEGER NOT NULL,
    uniques   INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (repo, date, referrer)
);

CREATE INDEX idx_repo_referrers_repo_date ON repo_referrers (repo, date);

-- Popular paths (same rolling-snapshot caveat as referrers)
CREATE TABLE repo_popular_paths (
    id        BIGSERIAL PRIMARY KEY,
    repo      TEXT NOT NULL,
    date      DATE NOT NULL,           -- snapshot date
    path      TEXT NOT NULL,           -- e.g. '/youruser/repo1/blob/main/README.md'
    title     TEXT,                    -- GitHub-provided page title, can be null
    count     INTEGER NOT NULL,
    uniques   INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (repo, date, path)
);

CREATE INDEX idx_repo_popular_paths_repo_date ON repo_popular_paths (repo, date);
