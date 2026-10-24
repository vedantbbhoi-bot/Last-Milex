import { ArrowDownRight, ArrowUpRight, Boxes, CircleAlert, RotateCw, Truck } from 'lucide-react';
import type { ClaimAudit, SubBatch, Batch } from '../lib/types/domain';
import { formatPercentage, formatQuantity } from '../lib/format';

interface Props { batches: Batch[]; subBatches: SubBatch[]; audit: ClaimAudit[] }

export function MetricStrip({ batches, subBatches, audit }: Props) {
  const total = batches.reduce((sum, batch) => sum + batch.quantity, 0);
  const spoiled = subBatches.filter((item) => item.status === 'spoiled').reduce((sum, item) => sum + item.quantity, 0);
  const percentSpoiled = formatPercentage(spoiled, total);
  const metrics = [
    { label: 'Spoiled', value: `${percentSpoiled}%`, note: `${formatQuantity(spoiled)} units lost`, icon: CircleAlert, tone: percentSpoiled > 0 ? 'coral' : 'green' },
    { label: 'Ghost revokes', value: String(audit.filter((event) => event.event === 'dead_man_revoked').length), note: 'claims recovered', icon: RotateCw, tone: 'amber' },
    { label: 'Sub-batches', value: String(subBatches.length), note: 'split for delivery', icon: Boxes, tone: 'ink' },
    { label: 'Delivered', value: String(subBatches.filter((item) => item.status === 'delivered').length), note: 'confirmed handoffs', icon: Truck, tone: 'green' },
    { label: 'Reroutes', value: String(audit.filter((event) => event.event === 'rerouted').length), note: 'shelter shocks handled', icon: ArrowUpRight, tone: 'blue' },
  ];
  return <section className="metric-strip" aria-label="Live operations metrics">
    {metrics.map(({ label, value, note, icon: Icon, tone }, index) => <article className={`metric-card metric-${tone}`} key={label}>
      <div className="metric-top"><span>{label}</span><Icon size={15} aria-hidden="true" /></div>
      <div className="metric-value">{value}</div><div className="metric-note">{index === 0 && percentSpoiled === 0 ? <ArrowDownRight size={12} /> : null}{note}</div>
    </article>)}
  </section>;
}
