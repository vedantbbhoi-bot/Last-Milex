import { useEffect, useMemo, useRef } from 'react';
import { gsap } from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { Map, Navigation2, PackageCheck } from 'lucide-react';
import type { Shelter, SubBatch } from '../../lib/types/domain';

gsap.registerPlugin(MotionPathPlugin);

interface Props { shelters: Shelter[]; subBatches: SubBatch[] }
interface Route { item: SubBatch; shelter: Shelter; path: string; target: { x: number; y: number } }

function routeId(id: string) { return `route-${id.replaceAll('-', '')}`; }

export function FlowMap({ shelters, subBatches }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const markerRefs = useRef<Record<string, SVGGElement | null>>({});
  const visibleShelters = shelters.slice(0, 4);
  const routes = useMemo<Route[]>(() => subBatches
    .filter((item) => ['claimed', 'in_transit'].includes(item.status) && item.shelter_id)
    .flatMap((item) => {
      const shelter = shelters.find((candidate) => candidate.id === item.shelter_id);
      if (!shelter) return [];
      const index = Math.max(0, shelters.findIndex((candidate) => candidate.id === shelter.id));
      const y = 78 + (index % 4) * 72;
      const x = 650;
      const startX = 148;
      const startY = 176;
      const curve = Math.max(42, Math.abs(y - startY) * 0.6);
      const path = `M ${startX} ${startY} C 320 ${startY - curve}, 456 ${y + curve}, ${x} ${y}`;
      return [{ item, shelter, path, target: { x, y } }];
    }), [shelters, subBatches]);
  const routeSignature = routes.map((route) => `${route.item.id}:${route.item.shelter_id}:${route.item.status}`).join('|');

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || routes.length === 0) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    routes.forEach((route) => {
      const marker = markerRefs.current[route.item.id];
      const path = svg.querySelector<SVGPathElement>(`#${routeId(route.item.id)}`);
      if (!marker || !path) return;
      if (prefersReduced) {
        gsap.set(marker, { x: 0, y: 0, opacity: 1 });
        return;
      }
      gsap.to(marker, {
        motionPath: { path, align: path, alignOrigin: [0.5, 0.5], autoRotate: true, start: 0, end: 1 },
        duration: 0.7,
        ease: 'power2.inOut',
        overwrite: 'auto',
      });
    });
    return () => { gsap.killTweensOf(Object.values(markerRefs.current).filter(Boolean)); };
  }, [routeSignature, routes]);

  return <section className="panel flow-panel">
    <div className="panel-heading"><div><span className="section-index">02 / LIVE TRANSIT</span><h2>Dispatch flow</h2></div><span className="flow-live"><span className="live-dot" /> REALTIME</span></div>
    <div className="flow-canvas">
      <svg ref={svgRef} viewBox="0 0 760 350" role="img" aria-labelledby="flow-title flow-desc" preserveAspectRatio="xMidYMid meet">
        <title id="flow-title">Live donor to shelter route map</title><desc id="flow-desc">Curved routes connect the donor handoff point to shelters. Rider markers follow committed database assignments.</desc>
        <defs>
          <pattern id="map-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeOpacity=".055" strokeWidth=".7" /></pattern>
          <marker id="route-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#2d6a53" /></marker>
        </defs>
        <rect x="0" y="0" width="760" height="350" rx="14" fill="url(#map-grid)" />
        <path className="map-contour" d="M232 16c90 50 8 102 116 143s-14 85 78 175M308 8c50 45 22 84 82 111s-3 93 49 161M477 4c-44 56 34 98-6 137s-26 90 14 206" fill="none" />
        <text x="36" y="32" className="map-label">DONOR / PICKUP</text>
        <circle cx="102" cy="176" r="38" className="donor-halo" /><circle cx="102" cy="176" r="24" className="donor-node" />
        <foreignObject x="88" y="162" width="28" height="28"><div className="map-icon donor-map-icon"><PackageCheck size={22} /></div></foreignObject>
        <text x="60" y="228" className="map-node-name">Origin hub</text>
        <text x="60" y="245" className="map-node-meta">BATCH INTAKE</text>
        {routes.map(({ item, path, shelter }, index) => <g key={item.id}>
          <path id={routeId(item.id)} d={path} className={`route-line ${item.status === 'in_transit' ? 'route-moving' : 'route-claimed'}`} markerEnd="url(#route-arrow)" />
          <g ref={(element) => { markerRefs.current[item.id] = element; }} className={`rider-marker ${index % 2 ? 'marker-alt' : ''}`}>
            <circle r="10" className="rider-marker-halo" /><circle r="6" className="rider-marker-core" /><Navigation2 size={10} className="rider-marker-icon" />
          </g>
          <text x="{0}" y="{0}" className="sr-only">Rider assigned to {shelter.name}</text>
        </g>)}
        {visibleShelters.map((shelter, index) => {
          const x = 650, y = 78 + index * 72;
          return <g key={shelter.id} className="shelter-node"><circle cx={x} cy={y} r="19" className={shelter.current_demand > 0 ? 'shelter-node-ring demand-open' : 'shelter-node-ring'} /><circle cx={x} cy={y} r="12" className="shelter-node-core" /><text x={x + 30} y={y - 1} className="map-node-name">{shelter.name.length > 16 ? `${shelter.name.slice(0, 15)}…` : shelter.name}</text><text x={x + 30} y={y + 15} className="map-node-meta">{shelter.current_demand > 0 ? `${shelter.current_demand} UNFILLED` : 'NO DEMAND'}</text></g>;
        })}
        {routes.length === 0 && <g className="map-empty"><path d="M198 176 C 310 100, 438 252, 564 176" className="route-empty" /><circle cx="378" cy="176" r="5" /><text x="274" y="216">Routes appear when claims are committed</text></g>}
      </svg>
      <div className="flow-legend"><span><i className="legend-origin" /> DONOR</span><span><i className="legend-rider" /> RIDER</span><span><i className="legend-shelter" /> SHELTER</span><span className="map-count"><Map size={12} /> {routes.length} ACTIVE ROUTES</span></div>
    </div>
  </section>;
}
