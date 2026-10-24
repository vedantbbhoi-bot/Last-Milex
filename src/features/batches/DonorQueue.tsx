import { useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, Clock3, PackagePlus, Plus, Split, X } from 'lucide-react';
import type { Batch, Dependency, Profile, SubBatch } from '../../lib/types/domain';
import { dependencyLabel, formatCountdown, formatQuantity } from '../../lib/format';
import { supabase } from '../../lib/supabase/client';

interface Props { profile: Profile; batches: Batch[]; subBatches: SubBatch[]; onRefresh: () => void }

export function DonorQueue({ profile, batches, subBatches, onRefresh }: Props) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState('180');
  const [dependency, setDependency] = useState<Dependency>('none');
  const [hours, setHours] = useState('4');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const mine = useMemo(() => batches.filter((batch) => batch.donor_id === profile.id), [batches, profile.id]);

  async function createBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setNotice(null);
    const { data, error } = await supabase.rpc('create_batch', {
      p_quantity: Number(quantity),
      p_dependency: dependency,
      p_expires_at: new Date(Date.now() + Number(hours) * 3_600_000).toISOString(),
    });
    if (error) { setNotice(error.message); setBusy(false); return; }
    const batchId = typeof data === 'string' ? data : (data as { batch_id?: string } | null)?.batch_id;
    if (!batchId) { setNotice('The server did not return a batch ID.'); setBusy(false); return; }
    const { error: splitError } = await supabase.rpc('split_batch', { p_batch_id: batchId });
    setBusy(false);
    setNotice(splitError ? `Batch created; split needs attention: ${splitError.message}` : 'Batch split committed. Live queue is refreshing.');
    if (!splitError) setOpen(false);
    onRefresh();
  }

  return <section className="panel donor-panel">
    <div className="panel-heading"><div><span className="section-index">01 / INTAKE</span><h2>Donor queue</h2></div><button className="quiet-button" type="button" onClick={() => setOpen((value) => !value)}>{open ? <X size={15} /> : <Plus size={15} />}{open ? 'Close' : 'Add batch'}</button></div>
    {open && <form className="batch-form" onSubmit={createBatch}>
      <div className="form-grid"><label>UNITS<input type="number" min="1" max="10000" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label><label>HOURS LEFT<input type="number" min="1" max="72" value={hours} onChange={(event) => setHours(event.target.value)} required /></label></div>
      <label>RESOURCE DEPENDENCY<select value={dependency} onChange={(event) => setDependency(event.target.value as Dependency)}><option value="none">No water/fuel dependency</option><option value="water">Requires water</option><option value="fuel">Requires fuel</option><option value="both">Requires water and fuel</option></select></label>
      <button className="primary-button full-button" disabled={busy || profile.role !== 'donor'} type="submit"><PackagePlus size={16} />{busy ? 'Splitting on server…' : 'Create & split batch'}</button>
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
    <div className="panel-footnote">Every split and reservation is committed atomically by Supabase.</div>
  </section>;
}
