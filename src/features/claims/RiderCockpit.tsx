import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Check, Clock3, Hand, MapPin, Radio, Truck } from 'lucide-react';
import type { Profile, SubBatch } from '../../lib/types/domain';
import { dependencyLabel, formatCountdown, heartbeatAge, heartbeatTone } from '../../lib/format';
import { supabase } from '../../lib/supabase/client';

interface Props { profile: Profile; subBatches: SubBatch[]; onRefresh: () => void }

export function RiderCockpit({ profile, subBatches, onRefresh }: Props) {
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const active = useMemo(() => subBatches.find((item) => item.rider_id === profile.id && ['claimed', 'in_transit'].includes(item.status)) ?? null, [profile.id, subBatches]);
  const pool = useMemo(() => subBatches.filter((item) => item.status === 'available' && item.shelter_id), [subBatches]);
  const age = heartbeatAge(active?.heartbeat_at ?? null);
  const tone = heartbeatTone(active?.heartbeat_at ?? null);
  const secondsToRevoke = age === null ? 90 : Math.max(0, 90 - age);
  const pulseSpeed = `${(0.7 + (secondsToRevoke / 90) * 1.6).toFixed(2)}s`;

  useEffect(() => {
    const client = supabase;
    if (!client || !active || profile.role !== 'rider') return;
    const timer = window.setInterval(() => {
      void client.rpc('heartbeat', { p_sub_batch_id: active.id }).then(({ error }) => {
        if (error) setNotice(error.message);
        else onRefresh();
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [active?.id, profile.role, onRefresh]);

  async function runRpc(name: 'claim_sub_batch' | 'confirm_pickup' | 'deliver_sub_batch', id: string) {
    const client = supabase;
    if (!client) return;
    setWorking(true); setNotice(null);
    const { error } = await client.rpc(name, { p_sub_batch_id: id });
    setWorking(false);
    if (error) setNotice(error.message); else { setNotice(name === 'claim_sub_batch' ? 'Claim held for five minutes. Confirm pickup before the deadline.' : 'Server state updated.'); onRefresh(); }
  }

  return <section className="panel rider-panel">
    <div className="panel-heading"><div><span className="section-index">04 / RIDER LINK</span><h2>Rider cockpit</h2></div><span className={`heartbeat-tag tone-${tone}`}><span className="pulse-dot" style={{ '--pulse-speed': pulseSpeed } as CSSProperties} /><Radio size={13} />{tone === 'muted' ? 'NO HEARTBEAT' : `${age}s AGO`}</span></div>
    {profile.role !== 'rider' && profile.role !== 'admin' ? <div className="empty-state compact"><Truck size={20} /><strong>Rider access required</strong><span>Claims are limited to approved rider accounts.</span></div> : active ? <div className="active-claim">
      <div className="claim-label"><span className="active-indicator" /> ACTIVE CLAIM <span className={`status-pill status-${active.status}`}>{active.status.replaceAll('_', ' ')}</span></div>
      <div className="claim-route"><span className="route-origin">LOT / {active.batch_id.slice(0, 7).toUpperCase()}</span><MapPin size={15} /><span>{active.shelter?.name ?? `Shelter ${active.shelter_id?.slice(0, 5) ?? 'pending'}`}</span></div>
      <div className="claim-details"><span>{active.quantity} units</span><span>{dependencyLabel(active.dependency)}</span><span><Clock3 size={13} /> {formatCountdown(active.expires_at)}</span></div>
      <div className="deadline-line"><span>PICKUP WINDOW</span><strong>{formatCountdown(active.confirmation_deadline)}</strong></div>
      {active.status === 'claimed' ? <button className="primary-button full-button" disabled={working} onClick={() => void runRpc('confirm_pickup', active.id)} type="button"><Check size={16} />{working ? 'Checking destination…' : 'Confirm pickup'}</button> : <button className="primary-button full-button" disabled={working} onClick={() => void runRpc('deliver_sub_batch', active.id)} type="button"><Check size={16} />{working ? 'Recording handoff…' : 'Confirm delivery'}</button>}
      <p className="heartbeat-note">Heartbeat updates every 60 seconds. Revoke threshold: 90 seconds; sweep interval: 30 seconds.</p>
    </div> : <div className="claim-pool"><div className="empty-state compact"><Hand size={20} /><strong>No active claim</strong><span>Available assignments are checked against dependency, shelter demand, and expiry.</span></div>
      {pool.slice(0, 3).map((item) => <article className="pool-card" key={item.id}><div><strong>{item.quantity} units</strong><span>{dependencyLabel(item.dependency)}</span></div><button className="quiet-button" type="button" disabled={working || profile.role !== 'rider'} onClick={() => void runRpc('claim_sub_batch', item.id)}>Claim <Truck size={14} /></button></article>)}
    </div>}
    {notice && <p className="inline-notice" role="status">{notice}</p>}
  </section>;
}
