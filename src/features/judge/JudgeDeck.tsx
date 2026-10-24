import { useState } from 'react';
import { AlertOctagon, Beaker, CheckCircle2, Droplets, PackageOpen, RotateCcw, RotateCw } from 'lucide-react';
import type { Profile } from '../../lib/types/domain';
import { supabase } from '../../lib/supabase/client';
import { demoStore } from '../../lib/demoStore';

const scenarios = [
  { id: 'ghost_rider', label: 'Simulate ghost rider', icon: RotateCw, detail: 'Advance an unconfirmed claim past its dead-man deadline (auto-revocation).' },
  { id: 'shelter_filled', label: 'Fill shelter mid-route', icon: AlertOctagon, detail: 'Trigger destination shock (100% capacity) and live reroute.' },
  { id: 'dependency_violation', label: 'Trigger dependency violation', icon: Droplets, detail: 'Attempt pickup where destination lacks required water/fuel.' },
  { id: 'split_180', label: 'Force 180-unit split', icon: PackageOpen, detail: 'Create 180-unit perishable batch and split against 40-unit cap.' },
  { id: 'reset', label: 'Reset to benchmark', icon: RotateCcw, detail: 'Restore all shelters, batches, riders, and audit logs to clean state.' },
] as const;

export function JudgeDeck({ profile, onRefresh }: { profile: Profile; onRefresh: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(true);

  if (profile.role !== 'admin') return null;

  async function run(id: string) {
    setBusy(id);
    setMessage(null);

    const isDemo = profile.id.startsWith('demo-') || !supabase;

    if (!isDemo && supabase) {
      try {
        const { data, error } = await supabase.rpc('run_judge_scenario', { p_scenario: id });
        if (!error && data) {
          setBusy(null);
          setSuccess(true);
          setMessage(typeof data === 'string' ? data : JSON.stringify(data));
          onRefresh();
          return;
        }
      } catch {
        // Fall back to client demo engine
      }
    }

    // Run client demo simulation engine
    try {
      const resultText = demoStore.runJudgeScenario(id);
      setBusy(null);
      setSuccess(true);
      setMessage(resultText);
      onRefresh();
    } catch (err) {
      setBusy(null);
      setSuccess(false);
      setMessage(err instanceof Error ? err.message : 'Scenario execution failed.');
    }
  }

  return (
    <section className="judge-deck">
      <div className="judge-heading">
        <div>
          <span className="section-index">HACKATHON EVALUATION / FAILURE INJECTION DECK</span>
          <h2><Beaker size={18} /> Stress the handoff</h2>
        </div>
        <span className="admin-only-tag">JUDGE & ADMIN ONLY</span>
      </div>
      <div className="judge-actions">
        {scenarios.map(({ id, label, icon: Icon, detail }) => (
          <button
            className="scenario-button"
            key={id}
            type="button"
            disabled={busy !== null}
            onClick={() => void run(id)}
            title={detail}
          >
            <Icon size={16} />
            <span>{busy === id ? 'Simulating…' : label}</span>
            <small>{detail}</small>
          </button>
        ))}
      </div>
      {message && (
        <div className={`scenario-feedback-banner ${success ? 'is-success' : 'is-error'}`} role="status">
          <CheckCircle2 size={16} />
          <span>{message}</span>
        </div>
      )}
    </section>
  );
}
