import assert from 'node:assert/strict';
import test from 'node:test';
import { buildISDStrategy } from '../src/isd-strategy.mjs';
import { buildFrontier } from '../src/frontier.mjs';

const job = (id, descriptionHtml, extra = {}) => ({
  id, org: 'isd', status: 'open', title: 'Delivery Architect',
  url: 'https://apply.careers.microsoft.com/careers/job/123',
  descriptionHtml, ...extra,
});
const signal = (result, id) => result.signals.find((item) => item.id === id);

test('ISD evidence excludes FDE, other units, unknown assignments and closed adverts', () => {
  const html = '<h2>Responsibilities</h2><p>Build AI systems and deploy them in production.</p>';
  const result = buildISDStrategy([
    job('a', html), job('b', html, { org: 'fde' }), job('c', html, { org: 'atu' }),
    job('d', html, { org: null }), job('e', html, { status: 'closed' }),
  ]);
  const ai = signal(result, 'production-ai');
  assert.equal(result.isdCount, 1);
  assert.equal(result.fdeCount, 1);
  assert.equal(ai.count, 1);
  assert.equal(ai.fdeCount, 1);
  assert.equal(ai.share, 100);
  assert.deepEqual(ai.evidence.map((item) => item.id), ['a']);
});

test('qualifications and benefit claims do not become organisational intent', () => {
  const result = buildISDStrategy([job('a',
    '<h2>Overview</h2><p>Join our team of experienced consultants.</p>' +
    '<h2>Qualifications</h2><p>Build AI systems and deploy them in production.</p>' +
    '<h2>Responsibilities</h2><p>Work with a team on customer projects.</p>' +
    '<h2>Benefits</h2><p>Develop reusable accelerators and delivery assets.</p>'
  )]);
  assert.equal(signal(result, 'production-ai').count, 0);
  assert.equal(signal(result, 'reusable-delivery').count, 0);
});

test('repeated organisation wording is not counted as independent evidence', () => {
  const html = '<h2>Overview</h2><p>We accelerate adoption and productive use of Microsoft technology.</p>';
  const result = buildISDStrategy([job('a', html), job('b', html)]);
  const adoption = signal(result, 'adoption');
  assert.equal(adoption.count, 2);
  assert.equal(adoption.distinctPassages, 1);
  assert.equal(adoption.evidence.length, 1);
  assert.equal(adoption.evidenceLevel, 'Repeated wording');
  assert.equal(signal(result, 'business-outcomes').count, 0);
});

test('topic and action must share a passage, and negated assignments do not support it', () => {
  const result = buildISDStrategy([
    job('a', '<h2>Overview</h2><p>We discuss the future of AI.</p><p>Build customer relationships with the team.</p>'),
    job('b', '<h2>Responsibilities</h2><p>We do not build AI systems in this role.</p>'),
  ]);
  assert.equal(signal(result, 'production-ai').count, 0);
});

test('empty or unreadable cohorts have null percentages, not invented zero demand', () => {
  const result = buildISDStrategy([job('a', '<p>Text without recognised section headings.</p>')]);
  assert.equal(result.isdCount, 1);
  assert.equal(result.isdReadable, 0);
  assert.equal(result.fdeReadable, 0);
  assert.equal(signal(result, 'production-ai').share, null);
  assert.equal(signal(result, 'production-ai').fdeShare, null);
  assert.match(result.summary, /not enough/);
  assert.equal(buildFrontier([]).strategy.isdCount, 0);
});

test('published overview preview is clearly labelled and preserves exact source text', () => {
  const overview = 'Our delivery team enables accelerated adoption of customer technology.';
  const result = buildISDStrategy([job('a', undefined, { overview })]);
  const adoption = signal(result, 'adoption');
  assert.equal(result.evidenceMode, 'Limited or mixed source text');
  assert.equal(result.fullDescriptions, 0);
  assert.equal(adoption.evidence[0].excerpt, overview);
  assert.equal(adoption.evidence[0].section, 'Published overview excerpt');
  assert.equal(adoption.evidence[0].observedAt, null);
});

test('evidence samples retain capture time and observations do not imply survival', () => {
  const result = buildISDStrategy([job('a',
    '<h2>Responsibilities</h2><p>Develop reusable delivery assets to scale customer engagements.</p>',
    { detailFetchedAt: '2026-09-05T01:00:00Z' }
  )]);
  const reuse = signal(result, 'reusable-delivery');
  assert.equal(reuse.evidence[0].observedAt, '2026-09-05T01:00:00Z');
  assert.equal(reuse.evidenceLevel, 'One advert');
  assert.match(result.summary, /not an approved survival strategy/);
});

test('organisation role lists and truncated preview clauses are not delivery commitments', () => {
  const result = buildISDStrategy([
    job('a', '<h2>Overview</h2><p>Industry Solutions Delivery hosts security experts, architects, consultants and delivery specialists.</p>'),
    job('b', undefined, { overview: 'Our team works with customers. We implement security controls and' }),
  ]);
  assert.equal(signal(result, 'trusted-delivery').count, 0);
  assert.equal(signal(result, 'business-outcomes').count, 0);
});

test('an empty Responsibilities section cannot absorb the adjacent Qualifications section', () => {
  const result = buildISDStrategy([job('a',
    '<h2>Overview</h2><p>Join our team of consultants.</p>' +
    '<h2>Responsibilities</h2><h2>Qualifications</h2>' +
    '<p>Experience building AI systems in production is required.</p>'
  )]);
  assert.equal(signal(result, 'production-ai').count, 0);
});

test('qualification heading variants terminate the overview evidence block', () => {
  for (const heading of ['Required Qualifications', 'Preferred Qualifications', 'Minimum Qualifications', 'Additional Qualifications']) {
    const result = buildISDStrategy([job('a',
      `<h2>Overview</h2><p>Join our team of consultants.</p><h2>${heading}</h2>` +
      '<p>Experience building AI systems in production is required.</p>'
    )]);
    assert.equal(signal(result, 'production-ai').count, 0, heading);
  }
});
