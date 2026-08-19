# Github-Metrics

Daily collector for GitHub repo traffic stats (views, unique visitors, clones,
referral sources, popular paths), stored long-term in Postgres.

GitHub's Traffic API only retains **14 days** of history — this pipeline runs
daily via GitHub Actions and archives that data before it disappears.

## How it works

```
GitHub Actions (daily cron)
        │
        ▼
scripts/collect-metrics.js
        │
        ├─ Discovers all public repos for GH_USER (skips forks by default)
        ├─ Fetches per repo:
        │     /traffic/views?per=day
        │     /traffic/clones?per=day
        │     /traffic/popular/referrers
        │     /traffic/popular/paths
        │
        ▼
   Postgres (Aiven)
        │
        ▼
Next.js dashboard (reads only, not part of this repo)
```

## Data collected

| Table | Contents | Granularity |
|---|---|---|
| `repo_daily_metrics` | views + clones (count & uniques) | true per-day, from GitHub |
| `repo_referrers` | top referral sources | rolling 14-day snapshot, stamped with collection date |
| `repo_popular_paths` | top visited paths/pages | rolling 14-day snapshot, stamped with collection date |

> Note: `views`/`clones` come with real daily timestamps from GitHub.
> `referrers`/`paths` do **not** — GitHub only returns "top 10 over the last
> 14 days" with no date breakdown, so each day's collection is really a
> snapshot, not a true daily delta.

Table schemas: see `schema.sql`.

## Setup

### 1. Repo secrets

`Settings → Secrets and variables → Actions → New repository secret`

| Secret | Value |
|---|---|
| `METRICS_GH_TOKEN` | Fine-grained PAT with **Administration: read** on target repos (required for traffic endpoints — `Contents: read` alone is not enough) |
| `DATABASE_URL` | Postgres connection string |
| `PG_CA_CERT` | CA certificate contents (Aiven requires this for SSL verification; download from the Aiven console service page) |

### 2. Update the workflow

In `.github/workflows/collect-metrics.yml`, set:

```yaml
env:
  GH_USER: youruser   # your GitHub username or org
```

### 3. Run it

- Runs automatically daily at 03:00 UTC
- Trigger manually anytime: **Actions tab → collect-github-metrics → Run workflow**


## Notes

- **Fork handling**: forks are skipped by default. Set `INCLUDE_FORKS: 'true'`
  in the workflow env to include them.
- **Per-repo failures don't kill the run**: if the token lacks access to a
  specific repo's traffic data, that repo is skipped with a warning — the
  rest still collect.
- **SSL**: Aiven requires certificate verification against their CA
  (`PG_CA_CERT`), not the looser `rejectUnauthorized: false` shortcut. If your
  `DATABASE_URL` contains `?sslmode=require`, note that `pg` will build its
  own SSL config from that query param and may override the `ssl` object in
  code — remove `sslmode` from the URL if you hit certificate errors.
