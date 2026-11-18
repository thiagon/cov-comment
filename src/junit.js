const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" };

const decode = (value) => value.replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (entity) => ENTITIES[entity]);

const rawAttr = (tag, name) => {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? decode(match[1]) : '';
};

const attr = (tag, name) => Number(rawAttr(tag, name)) || 0;

const read = (tag) => ({
  tests: attr(tag, 'tests'),
  failures: attr(tag, 'failures'),
  errors: attr(tag, 'errors'),
  skipped: attr(tag, 'skipped'),
  time: attr(tag, 'time'),
});

function parseCases(xml) {
  return [...xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)].map(([, tag, body = '']) => {
    const problem = /<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/.exec(body);
    return {
      name: rawAttr(tag, 'name'),
      classname: rawAttr(tag, 'classname'),
      time: attr(tag, 'time'),
      status: problem ? problem[1] : /<skipped\b/.test(body) ? 'skipped' : 'passed',
      message: problem ? rawAttr(problem[2], 'message') || decode((problem[3] ?? '').trim()) : '',
    };
  });
}

function derive(xml, cases) {
  const duration = /<!--\s*duration_ms\s+([\d.]+)\s*-->/.exec(xml);
  const count = (status) => cases.filter((item) => item.status === status).length;
  return {
    tests: cases.length,
    failures: count('failure'),
    errors: count('error'),
    skipped: count('skipped'),
    time: duration ? Number(duration[1]) / 1000 : cases.reduce((sum, item) => sum + item.time, 0),
  };
}

export function parseJunit(xml) {
  const root = /<testsuites?\b[^>]*>/.exec(xml);
  if (!root) return null;
  const cases = parseCases(xml);
  return { ...(/\stests="/.test(root[0]) ? read(root[0]) : derive(xml, cases)), cases };
}

export const formatTime = (seconds) =>
  seconds >= 60 ? `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s` : `${seconds.toFixed(2)}s`;
