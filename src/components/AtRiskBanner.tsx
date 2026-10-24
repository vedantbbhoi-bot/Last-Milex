import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import type { SubBatch } from '../lib/types/domain';
import { formatQuantity } from '../lib/format';

export function AtRiskBanner({ subBatches }: { subBatches: SubBatch[] }) {
  const atRisk = subBatches.filter((item) => item.status === 'at_risk');
  if (atRisk.length === 0) return null;
  const units = atRisk.reduce((sum, item) => sum + item.quantity, 0);
  return <aside className="risk-banner" role="alert">
    <span className="risk-icon"><AlertTriangle size={18} /></span>
    <span className="risk-copy"><strong>{formatQuantity(units)} units need human intervention.</strong><span>{atRisk.length} sub-batch{atRisk.length === 1 ? '' : 'es'} has no verified rider or destination-safe fallback.</span></span>
    <span className="risk-action">REVIEW QUEUE <ArrowUpRight size={15} /></span>
  </aside>;
}
