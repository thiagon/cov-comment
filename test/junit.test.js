import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatTime, parseJunit } from '../src/junit.js';

test('uses root counts when present', () => {
  const xml = '<testsuites name="n" tests="5" failures="1" errors="0" skipped="2" time="1.5"><testcase name="a" time="1"/></testsuites>';
  const { cases, ...summary } = parseJunit(xml);
  assert.deepEqual(summary, { tests: 5, failures: 1, errors: 0, skipped: 2, time: 1.5 });
  assert.equal(cases.length, 1);
});

test('derives counts and details from testcases, decoding entities', () => {
  const xml = `<testsuites name="pytest"><testsuite name="s">
<testcase classname="mod.Cls" name="fails &amp; &lt;x&gt;" time="0.5"><failure message="boom &quot;q&quot;" type="E">trace</failure></testcase>
<testcase name="errors" time="0.25"><error type="E">only body &#39;text&#39;</error></testcase>
<testcase name="skips"><skipped message="s"/></testcase>
<testcase name="passes" time="0.1"></testcase>
<testcase name="bare"><failure/></testcase>
</testsuite></testsuites>`;
  const { cases, ...summary } = parseJunit(xml);
  assert.deepEqual(summary, { tests: 5, failures: 2, errors: 1, skipped: 1, time: 0.85 });
  assert.deepEqual(cases[0], { name: 'fails & <x>', classname: 'mod.Cls', file: '', line: 0, time: 0.5, status: 'failure', message: 'boom "q"' });
  assert.equal(cases[1].message, "only body 'text'");
  assert.equal(cases[2].status, 'skipped');
  assert.equal(cases[3].status, 'passed');
  assert.equal(cases[4].message, '');
});

test('reads file and line from attributes or the stack trace', () => {
  const xml = `<testsuites>
<testcase name="a" file="/w/t.js"><failure message="m">Error: m
    at TestContext.<anonymous> (file:///w/t.js:12:5)</failure></testcase>
<testcase name="b" file="/w/t.js" line="7"><failure message="m"/></testcase>
<testcase name="c" file="/w/t.js"><failure message="m">no frame here</failure></testcase>
</testsuites>`;
  const [a, b, c] = parseJunit(xml).cases;
  assert.deepEqual([a.file, a.line, b.line, c.line], ['/w/t.js', 12, 7, 0]);
});

test('decodes numeric character references without double decoding', () => {
  const xml = '<testsuites><testcase name="n"><failure message="a&#10;b &#x41; &amp;#10;"/></testcase></testsuites>';
  assert.equal(parseJunit(xml).cases[0].message, 'a\nb A &#10;');
});

test('prefers the node duration comment over summed times', () => {
  const xml = '<testsuites>\n<testcase name="a" time="0.1"/>\n<!-- duration_ms 216.5 -->\n</testsuites>';
  assert.equal(parseJunit(xml).time, 0.2165);
});

test('handles empty and invalid documents', () => {
  assert.deepEqual(parseJunit('<testsuites name="empty">'), { tests: 0, failures: 0, errors: 0, skipped: 0, time: 0, cases: [] });
  assert.equal(parseJunit('<html></html>'), null);
});

test('formats time', () => {
  assert.equal(formatTime(0.256), '0.26s');
  assert.equal(formatTime(65.25), '1m 5.3s');
});
