import { test } from 'node:test';
import assert from 'node:assert/strict';
import { policyToYaml } from '../../src/lib/sandbox/policy';

test('policy YAML shape matches OpenShell/OpenClaw egress pattern', () => {
  const yaml = policyToYaml({
    filesystem: { readWrite: ['/workspace'], readOnly: ['/skills'] },
    process: { allowBins: ['curl', 'jq'] },
    network: { egress: [{ host: 'api.github.com', port: 443, binary: 'curl' }] },
  });
  assert.ok(yaml.includes('filesystem:'));
  assert.ok(yaml.includes('"/workspace"'));
  assert.ok(yaml.includes('process:'));
  assert.ok(yaml.includes('- curl'));
  assert.ok(yaml.includes('network:'));
  assert.ok(yaml.includes('"api.github.com"'));
  assert.ok(yaml.includes('port: 443'));
  assert.ok(yaml.includes('binary: curl'));
});
