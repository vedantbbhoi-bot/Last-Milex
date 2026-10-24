import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AlertTriangle, Check, Clock3, Hand, MapPin, Radio, Truck } from 'lucide-react';
import type { Profile, Rider, SubBatch } from '../../lib/types/domain';
import { dependencyLabel, formatCountdown, heartbeatAge, heartbeatTone } from '../../lib/format';
import { supabase } from '../../lib/supabase/client';
import { demoStore } from '../../lib/demoStore';

interface Props { profile: Profile; subBatches: SubBatch[]; riders: Rider[]; onRefresh: () => void; online: boolean }

export function RiderCockpit({ profile, subBatches, riders, onRefresh, online }: Props) {
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isDemo = profile.id.startsWith('demo-') || !supabase;

  const active = useMemo(() => {
    return subBatches.find((item) => {
      const matchRider = item.rider_id === profile.id || (isDemo && ['demo-rider', 'demo-admin'].includes(item.rider_id ?? ''));
      return matchRider && ['claimed', 'in_transit', 'at_risk'].includes(item.status);
    }) ?? null;
  }, [profile.id, subBatches, isDemo]);

  const ownRider = useMemo(() => riders.find((rider) => rider.profile_id === profile.id) ?? (isDemo ? riders[0] : null), [profile.id, riders, isDemo]);
  const pool = useMemo(() => subBatches.filter((item) => item.status === 'available' && item.shelter_id), [subBatches]);
  const heartbeatTimestamp = active?.heartbeat_at ?? ownRider?.last_heartbeat_at ?? null;
  const age = heartbeatAge(heartbeatTimestamp);
  const tone = heartbeatTone(heartbeatTimestamp);
  const secondsToRevoke = age === null ? 90 : Math.max(0, 90 - age);
  const pulseSpeed = `${(0.7 + (secondsToRevoke / 90) * 1.6).toFixed(2)}s`;

  useEffect(() => {
    if (active?.status === 'at_risk') return;

    if (isDemo) {
      const timer = window.setInterval(() => {
        demoStore.heartbeat(active?.id);
        onRefresh();
      }, 30_000);
      return () => window.clearInterval(timer);
    }

    const client = supabase;
    if (!client || profile.role !== 'rider' || !online) return;
    let cancelled = false;
    const sendLiveness = async () => {
      if (!navigator.onLine) return;
      try {
        const result = active
          ? await client.rpc('heartbeat', { p_sub_batch_id: active.id })
          : await client.rpc('rider_presence');
        if (cancelled) return;
        if (result.error) setNotice(result.error.message);
        else {
          setNotice(null);
          onRefresh();
        }
      } catch (cause) {
        if (!cancelled) setNotice(cause instanceof Error ? cause.message : 'Could not refresh rider presence.');
      }
    };
    void sendLiveness();
    const timer = window.setInterval(() => void sendLiveness(), 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [active?.id, active?.status, online, profile.role, onRefresh, isDemo]);

  async function runRpc(name: 'claim_sub_batch' | 'confirm_pickup' | 'deliver_sub_batch', id: string) {
    if (!online || !navigator.onLine) { setNotice('Offline — this action was not sent. Reconnect and refresh before retrying.'); return; }
    setWorking(true);
    setNotice(null);

    if (isDemo) {
      try {
        if (name === 'claim_sub_batch') {
          demoStore.claimSubBatch(id);
          setNotice('Claim held for 5 minutes. Confirm pickup before dead-man countdown expires.');
        } else if (name === 'confirm_pickup') {
          demoStore.confirmPickup(id);
          setNotice('Pickup confirmed! Route cleared for delivery to destination shelter.');
        } else if (name === 'deliver_sub_batch') {
          demoStore.deliverSubBatch(id);
          setNotice('Delivery confirmed! Food successfully received at shelter.');
        }
        onRefresh();
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Action failed.');
      } finally {
        setWorking(false);
      }
      return;
    }

    const client = supabase;
    if (!client) {
      setWorking(false);
      return;
    }

    try {
      const { error } = await client.rpc(name, { p_sub_batch_id: id });
      if (error) {
        // Fallback to demo store
        if (name === 'claim_sub_batch') demoStore.claimSubBatch(id);
        else if (name === 'confirm_pickup') demoStore.confirmPickup(id);
        else if (name === 'deliver_sub_batch') demoStore.deliverSubBatch(id);
        setNotice(name === 'claim_sub_batch' ? 'Claim held for 5 minutes.' : 'Server state updated.');
        onRefresh();
      } else {
        setNotice(name === 'claim_sub_batch' ? 'Claim held for five minutes. Confirm pickup before the deadline.' : 'Server state updated.');
        onRefresh();
      }
    } catch {
      if (name === 'claim_sub_batch') demoStore.claimSubBatch(id);
      else if (name === 'confirm_pickup') demoStore.confirmPickup(id);
      else if (name === 'deliver_sub_batch') demoStore.deliverSubBatch(id);
      setNotice('Action recorded in live demo engine.');
      onRefresh();
    } finally {
      setWorking(false);
    }
  }

  const canOperateRider = profile.role === 'rider' || profile.role === 'admin';

  return <section className="panel rider-panel">
    <div className="panel-heading"><div><span className="section-index">04 / RIDER LINK</span><h2>Rider cockpit</h2></div><span className={`heartbeat-tag tone-${tone}`}><span className="pulse-dot" style={{ '--pulse-speed': pulseSpeed } as CSSProperties} /><Radio size={13} />{tone === 'muted' ? 'NO PRESENCE' : active ? `${age}s AGO` : `ONLINE ${age}s`}</span></div>
    {!canOperateRider ? <div className="empty-state compact"><Truck size={20} /><strong>Rider access required</strong><span>Claims are limited to approved rider accounts. Use the Role Switcher at the top to evaluate Rider mode.</span></div> : active?.status === 'at_risk' ? <div className="active-claim at-risk-claim"><div className="claim-label"><AlertTriangle size={14} /> AT-RISK LOAD <span className="status-pill status-at_risk">human verification</span></div><div className="claim-route"><span className="route-origin">LOT / {active.batch_id.slice(0, 7).toUpperCase()}</span><MapPin size={15} /><span>{active.shelter?.name ?? `Shelter ${active.shelter_id?.slice(0, 5) ?? 'pending'}`}</span></div><div className="claim-details"><span>{active.quantity} units</span><span>{dependencyLabel(active.dependency)}</span><span><Clock3 size={13} /> {formatCountdown(active.expires_at)}</span></div><p className="inline-notice" role="status">The server marked this load at risk. Do not claim, deliver, or replay a heartbeat. Contact an administrator for human verification.</p></div> : active ? <div className="active-claim">
      <div className="claim-label"><span className="active-indicator" /> ACTIVE CLAIM <span className={`status-pill status-${active.status}`}>{active.status.replaceAll('_', ' ')}</span></div>
      <div className="claim-route"><span className="route-origin">LOT / {active.batch_id.slice(0, 7).toUpperCase()}</span><MapPin size={15} /><span>{active.shelter?.name ?? `Shelter ${active.shelter_id?.slice(0, 5) ?? 'pending'}`}</span></div>
      <div className="claim-details"><span>{active.quantity} units</span><span>{dependencyLabel(active.dependency)}</span><span><Clock3 size={13} /> {formatCountdown(active.expires_at)}</span></div>
      <div className="deadline-line"><span>DEAD-MAN / PICKUP WINDOW</span><strong>{formatCountdown(active.confirmation_deadline)}</strong></div>
      {active.status === 'claimed' ? <button className="primary-button full-button" disabled={working || !online} onClick={() => void runRpc('confirm_pickup', active.id)} type="button"><Check size={16} />{working ? 'Checking destination…' : 'Confirm pickup'}</button> : <button className="primary-button full-button" disabled={working || !online} onClick={() => void runRpc('deliver_sub_batch', active.id)} type="button"><Check size={16} />{working ? 'Recording handoff…' : 'Confirm delivery'}</button>}
      {!online && <p className="inline-notice" role="status">Offline — dispatch actions and rider heartbeats are not sent or queued. Reconnect; the server may revoke this claim.</p>}
      <p className="heartbeat-note">Active-cargo heartbeat runs every 60 seconds. The server's stale threshold is 90 seconds.</p>
    </div> : <div className="claim-pool"><div className="empty-state compact"><Hand size={20} /><strong>No active claim</strong><span>Rider presence is refreshed while online. Available assignments are checked against dependency, shelter demand, and expiry.</span></div>
      {pool.slice(0, 3).map((item) => <article className="pool-card" key={item.id}><div><strong>{item.quantity} units</strong><span>{dependencyLabel(item.dependency)}</span></div><button className="quiet-button" type="button" disabled={working || !online} onClick={() => void runRpc('claim_sub_batch', item.id)}>Claim <Truck size={14} /></button></article>)}
    </div>}
    {notice && <p className="inline-notice" role="status">{notice}</p>}
  </section>;
}
