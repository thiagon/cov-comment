const API = 'https://api.github.com';

function client(fetchImpl, token) {
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'content-type': 'application/json',
  };
  return async (url, init) => {
    const res = await fetchImpl(url, { headers, ...init });
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${init?.method ?? 'GET'} ${url}`);
    return res.json();
  };
}

async function paginate(call, url) {
  const items = [];
  let batch;
  let page = 0;
  do {
    batch = await call(`${url}?per_page=100&page=${++page}`);
    items.push(...batch);
  } while (batch.length === 100);
  return items;
}

export async function listChangedFiles({ fetchImpl, token, repository, issueNumber }) {
  const files = await paginate(client(fetchImpl, token), `${API}/repos/${repository}/pulls/${issueNumber}/files`);
  return new Set(files.map((file) => file.filename));
}

export async function upsertComment({ fetchImpl, token, repository, issueNumber, body, marker }) {
  const call = client(fetchImpl, token);
  const comments = await paginate(call, `${API}/repos/${repository}/issues/${issueNumber}/comments`);
  const existing = comments.find((comment) => comment.body?.includes(marker));
  const payload = JSON.stringify({ body });
  if (existing) {
    return call(`${API}/repos/${repository}/issues/comments/${existing.id}`, { method: 'PATCH', body: payload });
  }
  return call(`${API}/repos/${repository}/issues/${issueNumber}/comments`, { method: 'POST', body: payload });
}
