import { Client } from 'pg';

const GH_TOKEN = process.env.GH_TOKEN;
const GH_USER = process.env.GH_USER;
const INCLUDE_FORKS = process.env.INCLUDE_FORKS === 'true'; // default: skip forks

async function ghFetch(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${path} -> ${res.status}: ${body}`);
  }
  return res.json();
}

// Paginate through /users/{user}/repos to get all public repos
async function getAllPublicRepos() {
  const repos = [];
  let page = 1;

  while (true) {
    const batch = await ghFetch(
      `/users/${GH_USER}/repos?type=public&per_page=100&page=${page}`
    );
    if (batch.length === 0) break;

    for (const r of batch) {
      // safety net, should already be filtered
      if (r.private) continue;
      // skip forks unless explicitly included
      if (r.fork && !INCLUDE_FORKS) continue;
      repos.push(r.full_name);
    }

    if (batch.length < 100) break; // last page
    page++;
  }

  return repos;
}

async function collectForRepo(client, repo) {
  let views, clones, referrers, paths;

  try {
    [views, clones, referrers, paths] = await Promise.all([
      ghFetch(`/repos/${repo}/traffic/views?per=day`),
      ghFetch(`/repos/${repo}/traffic/clones?per=day`),
      ghFetch(`/repos/${repo}/traffic/popular/referrers`),
      ghFetch(`/repos/${repo}/traffic/popular/paths`),
    ]);
  } catch (err) {
    // Traffic API requires push access to the repo. If the token doesn't have
    // admin/push rights on some repo (e.g. it's a public repo you don't own),
    // this will 403 — skip it rather than failing the whole run.
    console.warn(`skipping ${repo}: ${err.message}`);
    return;
  }

  for (const v of views.views) {
    await client.query(
      `INSERT INTO repo_daily_metrics (repo, date, metric, count, uniques)
       VALUES ($1, $2, 'views', $3, $4)
       ON CONFLICT (repo, date, metric) DO UPDATE SET count = $3, uniques = $4`,
      [repo, v.timestamp.slice(0, 10), v.count, v.uniques]
    );
  }

  for (const c of clones.clones) {
    await client.query(
      `INSERT INTO repo_daily_metrics (repo, date, metric, count, uniques)
       VALUES ($1, $2, 'clones', $3, $4)
       ON CONFLICT (repo, date, metric) DO UPDATE SET count = $3, uniques = $4`,
      [repo, c.timestamp.slice(0, 10), c.count, c.uniques]
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const r of referrers) {
    await client.query(
      `INSERT INTO repo_referrers (repo, date, referrer, count, uniques)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (repo, date, referrer) DO UPDATE SET count = $4, uniques = $5`,
      [repo, today, r.referrer, r.count, r.uniques]
    );
  }

  for (const p of paths) {
    await client.query(
      `INSERT INTO repo_popular_paths (repo, date, path, title, count, uniques)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (repo, date, path) DO UPDATE SET count = $5, uniques = $6`,
      [repo, today, p.path, p.title, p.count, p.uniques]
    );
  }

  console.log(`✓ ${repo} collected (${views.views.length} view-days, ${clones.clones.length} clone-days, ${referrers.length} referrers, ${paths.length} paths)`);
}

async function main() {
  if (!GH_USER) throw new Error('GH_USER env var is required');

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: true,   // verify the cert
      ca: process.env.PG_CA_CERT, // the provider's CA certificate, as a secret
    },
  });
  await client.connect();

  const repos = await getAllPublicRepos();
  console.log(`Found ${repos.length} public repos for ${GH_USER}`);

  for (const repo of repos) {
    await collectForRepo(client, repo);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
