const API = 'https://api.github.com';

export async function upsertComment({ fetchImpl = fetch, token, repository, issueNumber, body, marker }) {
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'content-type': 'application/json',
  };
  const call = async (url, init) => {
    const res = await fetchImpl(url, { headers, ...init });
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${init?.method ?? 'GET'} ${url}`);
    return res.json();
  };

  let existing = null;
  for (let page = 1; !existing; page++) {
    const items = await call(`${API}/repos/${repository}/issues/${issueNumber}/comments?per_page=100&page=${page}`);
    existing = items.find((item) => item.body?.includes(marker)) ?? null;
    if (items.length < 100) break;
  }

  const payload = JSON.stringify({ body });
  if (existing) {
    return call(`${API}/repos/${repository}/issues/comments/${existing.id}`, { method: 'PATCH', body: payload });
  }
  return call(`${API}/repos/${repository}/issues/${issueNumber}/comments`, { method: 'POST', body: payload });
}
