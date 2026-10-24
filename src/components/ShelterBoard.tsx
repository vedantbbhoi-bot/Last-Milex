import { Droplets, Flame, MapPin, Warehouse } from 'lucide-react';
import type { Shelter } from '../lib/types/domain';
import { formatQuantity } from '../lib/format';

export function ShelterBoard({ shelters }: { shelters: Shelter[] }) {
  return <section className="panel shelter-panel">
    <div className="panel-heading"><div><span className="section-index">03 / DESTINATION</span><h2>Shelter board</h2></div><span className="count-tag">{String(shelters.length).padStart(2, '0')} ACTIVE</span></div>
    {shelters.length === 0 ? <div className="empty-state compact"><Warehouse size={20} /><strong>No shelters yet</strong><span>Verified shelter locations appear here after an administrator adds them.</span></div> : <div className="shelter-list">{shelters.map((shelter, index) => {
      const ratio = shelter.capacity > 0 ? Math.min(1, shelter.current_demand / shelter.capacity) : 0;
      return <article className="shelter-card" key={shelter.id}>
        <div className="shelter-card-top"><span className="shelter-number">S{String(index + 1).padStart(2, '0')}</span><span className="shelter-name">{shelter.name}</span><MapPin size={13} className="muted-icon" /></div>
        <div className="demand-row"><span>UNFILLED DEMAND</span><strong>{formatQuantity(shelter.current_demand)} <small>/ {formatQuantity(shelter.capacity)}</small></strong></div>
        <div className="capacity-track" role="img" aria-label={`${Math.round(ratio * 100)} percent of shelter capacity is currently requested`}><span className="capacity-fill" style={{ transform: `scaleX(${ratio})` }} /></div>
        <div className="resource-row"><span className={`resource-chip ${shelter.has_water ? 'resource-ok' : 'resource-missing'}`}><Droplets size={13} />{shelter.has_water ? 'WATER OK' : 'NO WATER'}</span><span className={`resource-chip ${shelter.has_fuel ? 'resource-ok' : 'resource-missing'}`}><Flame size={13} />{shelter.has_fuel ? 'FUEL OK' : 'NO FUEL'}</span></div>
      </article>;
    })}</div>}
    <div className="panel-footnote">Water and fuel flags are re-checked by the database before pickup.</div>
  </section>;
}
