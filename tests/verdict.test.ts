import { describe, expect, it } from 'vitest';
import { parseVerdictMarker, verdictInstruction } from '../src/verdict.js';

describe('parseVerdictMarker', () => {
  it('parses a done marker with its summary', () => {
    expect(parseVerdictMarker('plan body\npi-herd-verdict: done pass=2 shipped the fix\n'))
      .toEqual({ verdict: 'done', pass: 2, summary: 'shipped the fix' });
  });

  it('returns the last usable marker when several are present', () => {
    const text = 'pi-herd-verdict: done pass=1 first pass\nmore findings\npi-herd-verdict: blocked pass=2 waiting on review\n';
    expect(parseVerdictMarker(text)).toEqual({ verdict: 'blocked', pass: 2, summary: 'waiting on review' });
  });

  it('keeps the last usable marker when a later marker is unusable', () => {
    const text = 'pi-herd-verdict: done pass=1 real verdict\npi-herd-verdict: done pass=0 bogus\n';
    expect(parseVerdictMarker(text)).toEqual({ verdict: 'done', pass: 1, summary: 'real verdict' });
  });

  it('matches markers case-insensitively and lowercases the verdict', () => {
    expect(parseVerdictMarker('PI-HERD-VERDICT: DONE PASS=3 All Good'))
      .toEqual({ verdict: 'done', pass: 3, summary: 'All Good' });
  });

  it('returns a null summary when the marker has none', () => {
    expect(parseVerdictMarker('pi-herd-verdict: blocked pass=1')).toEqual({ verdict: 'blocked', pass: 1, summary: null });
  });

  it.each([
    { name: 'pass zero', text: 'pi-herd-verdict: done pass=0 too early' },
    { name: 'negative pass', text: 'pi-herd-verdict: done pass=-1 rewound' },
    { name: 'non-numeric pass', text: 'pi-herd-verdict: done pass=one summary' },
    { name: 'missing pass', text: 'pi-herd-verdict: done' },
    { name: 'unknown verdict word', text: 'pi-herd-verdict: maybe pass=1 unsure' },
    { name: 'marker not at line start', text: 'note that pi-herd-verdict: done pass=1 is the protocol' },
    { name: 'indented marker', text: '  pi-herd-verdict: done pass=1 indented' },
    { name: 'no marker at all', text: 'just an ordinary artifact body\nwith two lines\n' },
    { name: 'empty text', text: '' }
  ])('returns null for $name', ({ text }) => {
    expect(parseVerdictMarker(text)).toBeNull();
  });
});

describe('verdictInstruction', () => {
  it('embeds the artifact path and pass in a parseable protocol line', () => {
    const instruction = verdictInstruction('/runs/demo/PLAN.md', 3);
    expect(instruction).toContain('/runs/demo/PLAN.md');
    expect(instruction).toContain('When pass 3 is complete');
    expect(instruction).toContain('pi-herd-verdict: done pass=3');
    expect(instruction).toContain('blocked');
  });

  it('is never itself parsed as a verdict when echoed into an artifact', () => {
    expect(parseVerdictMarker(verdictInstruction('/runs/demo/PLAN.md', 1))).toBeNull();
  });
});
