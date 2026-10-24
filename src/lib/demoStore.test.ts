import { describe, expect, it, beforeEach } from 'vitest';
import { demoStore, isDemoEmail, getDemoProfileForEmail, PRESET_DEMO_ACCOUNTS } from './demoStore';

describe('Demo Account Verification', () => {
  it('recognizes identical email and password as demo credentials', () => {
    expect(isDemoEmail('judge@test.com', 'judge@test.com')).toBe(true);
    expect(isDemoEmail('custom-donor@example.org', 'custom-donor@example.org')).toBe(true);
    expect(isDemoEmail('regular@user.com', 'different-password')).toBe(false);
  });

  it('recognizes preset demo accounts', () => {
    for (const preset of PRESET_DEMO_ACCOUNTS) {
      expect(isDemoEmail(preset.email, preset.email)).toBe(true);
      const profile = getDemoProfileForEmail(preset.email);
      expect(profile.role).toBe(preset.role);
    }
  });

  it('correctly maps roles from email prefixes', () => {
    expect(getDemoProfileForEmail('donor-test@domain.org').role).toBe('donor');
    expect(getDemoProfileForEmail('rider-volunteer@domain.org').role).toBe('rider');
    expect(getDemoProfileForEmail('shelter-lead@domain.org').role).toBe('shelter');
    expect(getDemoProfileForEmail('judge-evaluator@domain.org').role).toBe('admin');
  });
});

describe('Demo Store Operations & Scenarios', () => {
  beforeEach(() => {
    demoStore.resetToBaseline();
  });

  it('splits batches into 40-unit sub-batches respecting vehicle caps', () => {
    const { batch_id } = demoStore.createBatch(100, 'none', new Date(Date.now() + 3600000).toISOString());
    const snapshot = demoStore.getSnapshot();
    const children = snapshot.subBatches.filter((s) => s.batch_id === batch_id);
    expect(children.length).toBe(3); // 40 + 40 + 20
    expect(children[0].quantity).toBe(40);
    expect(children[1].quantity).toBe(40);
    expect(children[2].quantity).toBe(20);
  });

  it('handles claim, pickup, and delivery transitions', () => {
    const snapshot = demoStore.getSnapshot();
    const available = snapshot.subBatches.find((s) => s.status === 'available' && s.shelter_id === 'shelter-hope-downtown')!;
    expect(available).toBeDefined();

    // Claim
    demoStore.claimSubBatch(available.id);
    let updated = demoStore.getSnapshot().subBatches.find((s) => s.id === available.id)!;
    expect(updated.status).toBe('claimed');
    expect(updated.rider_id).toBeDefined();

    // Confirm Pickup
    demoStore.confirmPickup(available.id);
    updated = demoStore.getSnapshot().subBatches.find((s) => s.id === available.id)!;
    expect(updated.status).toBe('in_transit');

    // Deliver
    demoStore.deliverSubBatch(available.id);
    updated = demoStore.getSnapshot().subBatches.find((s) => s.id === available.id)!;
    expect(updated.status).toBe('delivered');
  });

  it('executes ghost rider scenario and revokes claim', () => {
    const result = demoStore.runJudgeScenario('ghost_rider');
    expect(result).toContain('Ghost Rider');
    const snapshot = demoStore.getSnapshot();
    const revokeAudit = snapshot.audit.find((a) => a.event === 'dead_man_revoked');
    expect(revokeAudit).toBeDefined();
  });

  it('executes shelter filled scenario and dynamically reroutes sub-batch', () => {
    const result = demoStore.runJudgeScenario('shelter_filled');
    expect(result).toContain('Destination Shock');
    const snapshot = demoStore.getSnapshot();
    const rerouteAudit = snapshot.audit.find((a) => a.event === 'rerouted');
    expect(rerouteAudit).toBeDefined();
  });

  it('executes 180-unit bulk split scenario', () => {
    const result = demoStore.runJudgeScenario('split_180');
    expect(result).toContain('180');
    const snapshot = demoStore.getSnapshot();
    const batch180 = snapshot.batches.find((b) => b.quantity === 180);
    expect(batch180).toBeDefined();
  });
});
