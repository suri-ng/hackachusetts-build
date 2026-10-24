import { describe, it, expect } from 'vitest';

// Scaffold sanity check (Task 1). Confirms the Node test project runs and the
// lib/ module skeletons are importable. Real logic tests arrive in Tasks 3-5.
import * as verdict from './verdict';
import * as phash from './phash';
import * as geotime from './geotime';
import * as claude from './claude';
import * as pipeline from './pipeline';

describe('scaffold', () => {
  it('runs the test harness', () => {
    expect(true).toBe(true);
  });

  it('exposes the lib/ core surface as functions', () => {
    expect(typeof verdict.compositeVerdict).toBe('function');
    expect(typeof verdict.unlockedValue).toBe('function');
    expect(typeof verdict.fillRatio).toBe('function');
    expect(typeof verdict.nextMilestone).toBe('function');
    expect(typeof phash.perceptualHash).toBe('function');
    expect(typeof geotime.geoTimeScore).toBe('function');
    expect(typeof claude.assessWithClaude).toBe('function');
    expect(typeof pipeline.runVerification).toBe('function');
  });
});
