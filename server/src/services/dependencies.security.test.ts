import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
// Exercise the actual transitive dependencies selected by the application install.
const proxyaddr = require('proxy-addr');
const { vulnerabilityCheck } = require('@simple-git/argv-parser');

describe('dependency security boundaries', () => {
  for (const subnet of ['::ffff:10.0.0.0/8', '::/1']) {
    it(`does not trust an external IPv4 peer through ${subnet}`, () => {
      expect(proxyaddr.compile(subnet)('203.0.113.9')).toBe(false);
    });
  }
  for (const subnet of ['10.0.0.0/8', '::ffff:10.0.0.0/104']) {
    it(`preserves legitimate proxy trust for ${subnet}`, () => {
      const trust = proxyaddr.compile(subnet);
      expect(trust('10.1.2.3')).toBe(true);
      expect(trust('203.0.113.9')).toBe(false);
    });
  }
  for (const editor of ['VISUAL', 'visual', 'EDITOR']) {
    it(`classifies ${editor} as an unsafe editor without launching it`, () => {
      expect(vulnerabilityCheck(['commit', '--amend'], { [editor]: 'test-editor' }))
        .toContainEqual(expect.objectContaining({ category: 'allowUnsafeEditor' }));
    });
  }
  it('preserves noninteractive Git commands without editor overrides', () => {
    expect(vulnerabilityCheck(['status', '--short'], {})).toEqual([]);
  });
});
