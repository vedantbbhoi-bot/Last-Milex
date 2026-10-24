import { useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, Clock3, PackagePlus, Plus, Split, X } from 'lucide-react';
import type { Batch, Dependency, Profile, SubBatch } from '../../lib/types/domain';
import { dependencyLabel, formatCountdown, formatQuantity } from '../../lib/format';
import { supabase } from '../../lib/supabase/client';

interface PendingCreate {
  requestId: string;
  quantity: number;
  dependency: Dependency;
  expiresAt: string;
  hours: string;
}

interface Props { profile: Profile; batches: Batch[]; subBatches: SubBatch[]; onRefresh: () => void; online: boolean }

function storageKey(profileId: string) { return `lastmilex:pending-batch-create:${profileId}`; }

function readPendingCreate(profileId: string): PendingCreate | null {
  try {
    const raw = sessionStorage.getItem(storageKey(profileId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingCreate>;
    if (typeof value.requestId !== 'string' || typeof value.quantity !== 'number' || typeof value.expiresAt !== 'string' || typeof value.hours !== 'string') return null;
    if (!['none', 'water', 'fuel', 'both'].includes(String(value.dependency))) return null;
    return value as PendingCreate;
  } catch {
    return null;
  }
}

function savePendingCreate(profileId: string, value: PendingCreate): boolean {
  try {
    sessionStorage.setItem(storageKey(profileId), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function createRequestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((part) => part.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function DonorQueue({ profile, batches, subBatches, onRefresh, online }: Props) {
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(() => readPendingCreate(profile.id));
  const [open, setOpen] = useState(Boolean(pendingCreate));
  const [quantity, setQuantity] = useState(() => pendingCreate ? String(pendingCreate.quantity) : '180');
  const [dependency, setDependency] = useState<Dependency>(() => pendingCreate?.dependency ?? 'none');
  const [hours, setHours] = useState(() => pendingCreate?.hours ?? '4');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const mine = useMemo(() => batches.filter((batch) => batch.donor_id === profile.id), [batches, profile.id]);

  async function createBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online || !navigator.onLine) { setNotice('You are offline. This batch has not been saved; reconnect before submitting.'); return; }
    if (!supabase) { setNotice('Supabase is not configured in this build.'); return; }

    let request = pendingCreate;
    if (!request) {
      const parsedQuantity = Number(quantity);
      const parsedHours = Number(hours);
      if (!Number.isSafeInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 10000 || !Number.isFinite(parsedHours) || parsedHours < 1 || parsedHours > 72) {
        setNotice('Enter a valid quantity and an expiry between 1 and 72 hours.');
        return;
      }
      request = {
        requestId: createRequestId(),
        quantity: parsedQuantity,
        dependency,
        expiresAt: new Date(Date.now() + parsedHours * 3_600_000).toISOString(),
        hours,
      };
      if (!savePendingCreate(profile.id, request)) {
        setNotice('This browser could not retain a safe retry key. Nothing was sent; allow session storage and try again.');
        return;
      }
      setPendingCreate(request);
    }

    setBusy(true);
    setNotice(null);
    try {
      const { data, error } = await supabase.rpc('create_batch', {
        p_quantity: request.quantity,
        p_dependency: request.dependency,
        p_expires_at: request.expiresAt,
        p_request_id: request.requestId,
      });
      if (error) {
        setNotice(`Creation could not be confirmed. The same request key is retained; retry to reconcile. ${error.message}`);
        onRefresh();
        return;
      }

      const batchId = typeof data === 'string' ? data : (data as { batch_id?: string } | null)?.batch_id;
      if (!batchId) {
        setNotice('The server did not return a batch ID. The same request key is retained for retry.');
        onRefresh();
        return;
      }

      const { error: splitError } = await supabase.rpc('split_batch', { p_batch_id: batchId });
      if (splitError) {
        setNotice(`Batch creation is confirmed, but splitting is not. Retry will reuse this batch: ${splitError.message}`);
        onRefresh();
        return;
      }

      sessionStorage.removeItem(storageKey(profile.id));
      setPendingCreate(null);
      setNotice('Batch creation and split are confirmed by the server. Refreshing the live queue.');
      setOpen(false);
      onRefresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Network request failed.';
      setNotice(`The request outcome is unknown. The same request key is retained; reconnect and retry. ${message}`);
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel donor-panel">
    <div className="panel-heading"><div><span className="section-index">01 / INTAKE</span><h2>Donor queue</h2></div><button className="quiet-button" type="button" onClick={() => setOpen((value) => !value)}>{open ? <X size={15} /> : <Plus size={15} />}{open ? 'Close' : pendingCreate ? 'Retry pending create' : 'Add batch'}</button></div>
    {open && <form className="batch-form" onSubmit={createBatch}>
      {pendingCreate && <p className="inline-notice" role="status">A prior create result is unresolved. Values and its idempotency key are locked; retry this exact request to avoid duplicates.</p>}
      <div className="form-grid"><label>UNITS<input type="number" min="1" max="10000" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={busy || Boolean(pendingCreate)} required /></label><label>HOURS LEFT<input type="number" min="1" max="72" value={hours} onChange={(event) => setHours(event.target.value)} disabled={busy || Boolean(pendingCreate)} required /></label></div>
      <label>RESOURCE DEPENDENCY<select value={dependency} onChange={(event) => setDependency(event.target.value as Dependency)} disabled={busy || Boolean(pendingCreate)}><option value="none">No water/fuel dependency</option><option value="water">Requires water</option><option value="fuel">Requires fuel</option><option value="both">Requires water and fuel</option></select></label>
      <button className="primary-button full-button" disabled={busy || !online || profile.role !== 'donor'} type="submit"><PackagePlus size={16} />{busy ? 'Confirming on server…' : pendingCreate ? 'Retry same create & split' : 'Create & split batch'}</button>
      {!online && <p className="inline-notice" role="status">Offline mode is read-only. Batch creation is not queued.</p>}
      {notice && <p className="inline-notice" role="status">{notice}</p>}
    </form>}
    {mine.length === 0 ? <div className="empty-state"><PackagePlus size={22} /><strong>Queue is clear.</strong><span>Create a batch; the database will split it against current demand, dependencies, and vehicle capacity.</span></div> : <div className="batch-list">{mine.map((batch) => {
      const children = subBatches.filter((item) => item.batch_id === batch.id);
      return <article className="batch-card" key={batch.id}>
        <div className="batch-head"><span className="batch-code">LOT / {batch.id.slice(0, 7).toUpperCase()}</span><span className={`status-pill status-${batch.status}`}>{batch.status.replaceAll('_', ' ')}</span></div>
        <div className="batch-summary"><strong>{formatQuantity(batch.quantity)} <small>units</small></strong><span><Clock3 size={13} /> {formatCountdown(batch.expires_at)}</span></div>
        <div className="batch-meta">{dependencyLabel(batch.dependency)} <ArrowRight size={12} /> {children.length} sub-batch{children.length === 1 ? '' : 'es'}</div>
        <div className="sub-batch-chips">{children.length === 0 ? <span className="chip muted-chip">Awaiting split</span> : children.map((child, index) => <span className={`chip chip-${child.status}`} key={child.id} title={`${child.status} · ${dependencyLabel(child.dependency)}`}><Split size={12} />{formatQuantity(child.quantity)} <small>#{index + 1}</small></span>)}</div>
      </article>;
    })}</div>}
    <div className="panel-footnote">Creation retries reuse one request ID; splits and reservations are committed by Supabase.</div>
  </section>;
}
