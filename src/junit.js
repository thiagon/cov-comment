const attr = (tag, name) => {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? Number(match[1]) : 0;
};

const read = (tag) => ({
  tests: attr(tag, 'tests'),
  failures: attr(tag, 'failures'),
  errors: attr(tag, 'errors'),
  skipped: attr(tag, 'skipped'),
  time: attr(tag, 'time'),
});

const count = (xml, tag) => (xml.match(new RegExp(`<${tag}\\b`, 'g')) ?? []).length;

function derive(xml) {
  const duration = /<!--\s*duration_ms\s+([\d.]+)\s*-->/.exec(xml);
  const cases = xml.match(/<testcase\b[^>]*>/g) ?? [];
  return {
    tests: cases.length,
    failures: count(xml, 'failure'),
    errors: count(xml, 'error'),
    skipped: count(xml, 'skipped'),
    time: duration ? Number(duration[1]) / 1000 : cases.reduce((sum, tag) => sum + attr(tag, 'time'), 0),
  };
}

export function parseJunit(xml) {
  const root = /<testsuites?\b[^>]*>/.exec(xml);
  if (!root) return null;
  return /\stests="/.test(root[0]) ? read(root[0]) : derive(xml);
}

export const formatTime = (seconds) =>
  seconds >= 60 ? `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s` : `${seconds.toFixed(2)}s`;
