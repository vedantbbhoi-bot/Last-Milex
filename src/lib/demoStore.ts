import type { Batch, ClaimAudit, DashboardData, Dependency, Profile, Rider, Role, Shelter, SubBatch } from './types/domain';

const DEMO_STORAGE_KEY = 'lastmilex:demo-data-v1';
const DEMO_USER_KEY = 'lastmilex:demo-user-session';

export interface DemoAccount {
  email: string;
  role: Role;
  displayName: string;
  description: string;
}

export const PRESET_DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: 'judge@lastmilex.app',
    role: 'admin',
    displayName: 'Judge / Evaluator',
    description: 'Full admin rights with failure injection deck & network monitor',
  },
  {
    email: 'donor@lastmilex.app',
    role: 'donor',
    displayName: 'Metro Harvest Donor Hub',
    description: 'Food donor queue with automated 40-unit batch splitter',
  },
  {
    email: 'rider@lastmilex.app',
    role: 'rider',
    displayName: 'Alex Chen (Cargo Fleet)',
    description: 'Volunteer rider cockpit with live heartbeat & pickup/delivery',
  },
  {
    email: 'shelter@lastmilex.app',
    role: 'shelter',
    displayName: 'Downtown Hope Shelter',
    description: 'Shelter intake coordinator with capacity & utility tracking',
  },
];

export function isDemoEmail(email: string, password?: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  if (password && password.trim() === email.trim()) return true;
  if (normalizedEmail.includes('demo') || normalizedEmail.includes('judge')) return true;
  if (normalizedEmail.endsWith('.demo') || normalizedEmail.endsWith('@lastmilex.app') || normalizedEmail.endsWith('@demo.com')) return true;
  return false;
}

export function getDemoProfileForEmail(email: string): Profile {
  const normalized = email.trim().toLowerCase();
  const matched = PRESET_DEMO_ACCOUNTS.find((acc) => acc.email.toLowerCase() === normalized);
  if (matched) {
    return {
      id: `demo-${matched.role}`,
      display_name: matched.displayName,
      role: matched.role,
    };
  }

  // Deduce role from email prefix
  let role: Role = 'admin';
  if (normalized.startsWith('donor')) role = 'donor';
  else if (normalized.startsWith('rider')) role = 'rider';
  else if (normalized.startsWith('shelter')) role = 'shelter';
  else if (normalized.startsWith('admin') || normalized.startsWith('judge')) role = 'admin';

  return {
    id: `demo-${role}-${normalized.replace(/[^a-z0-9]/g, '_')}`,
    display_name: normalized.split('@')[0].toUpperCase() + ' (Demo)',
    role,
  };
}

function getInitialDemoData(): DashboardData {
  const now = Date.now();
  const inMinutes = (min: number) => new Date(now + min * 60_000).toISOString();
  const agoMinutes = (min: number) => new Date(now - min * 60_000).toISOString();
  const agoSeconds = (sec: number) => new Date(now - sec * 1_000).toISOString();

  const shelters: Shelter[] = [
    {
      id: 'shelter-hope-downtown',
      name: 'Downtown Hope Shelter',
      capacity: 250,
      current_demand: 45,
      has_water: true,
      has_fuel: true,
      latitude: 37.7749,
      longitude: -122.4194,
    },
    {
      id: 'shelter-mission-kitchen',
      name: 'Mission Community Kitchen',
      capacity: 180,
      current_demand: 35,
      has_water: true,
      has_fuel: true,
      latitude: 37.7599,
      longitude: -122.4148,
    },
    {
      id: 'shelter-harbor-refuge',
      name: 'Harbor Family Refuge',
      capacity: 120,
      current_demand: 25,
      has_water: false, // Intentionally missing water to demonstrate dependency violation
      has_fuel: true,
      latitude: 37.7955,
      longitude: -122.3937,
    },
    {
      id: 'shelter-eastside-sanctuary',
      name: 'Eastside Youth Sanctuary',
      capacity: 90,
      current_demand: 15,
      has_water: true,
      has_fuel: false,
      latitude: 37.7612,
      longitude: -122.3888,
    },
  ];

  const batches: Batch[] = [
    {
      id: 'batch-prepared-meals-01',
      donor_id: 'demo-donor',
      quantity: 80,
      dependency: 'none',
      status: 'in_transit',
      expires_at: inMinutes(75),
      created_at: agoMinutes(20),
    },
    {
      id: 'batch-fresh-dairy-02',
      donor_id: 'demo-donor',
      quantity: 60,
      dependency: 'water',
      status: 'split',
      expires_at: inMinutes(45),
      created_at: agoMinutes(15),
    },
    {
      id: 'batch-bakery-03',
      donor_id: 'demo-donor',
      quantity: 180,
      dependency: 'none',
      status: 'open',
      expires_at: inMinutes(180),
      created_at: agoMinutes(5),
    },
  ];

  const subBatches: SubBatch[] = [
    {
      id: 'sub-batch-pm-01a',
      batch_id: 'batch-prepared-meals-01',
      shelter_id: 'shelter-hope-downtown',
      rider_id: 'demo-rider',
      quantity: 40,
      dependency: 'none',
      status: 'in_transit',
      expires_at: inMinutes(75),
      claimed_at: agoMinutes(15),
      confirmation_deadline: inMinutes(3),
      heartbeat_at: agoSeconds(18),
      picked_up_at: agoMinutes(10),
      delivered_at: null,
      created_at: agoMinutes(20),
      shelter: {
        id: 'shelter-hope-downtown',
        name: 'Downtown Hope Shelter',
        latitude: 37.7749,
        longitude: -122.4194,
      },
    },
    {
      id: 'sub-batch-pm-01b',
      batch_id: 'batch-prepared-meals-01',
      shelter_id: 'shelter-mission-kitchen',
      rider_id: 'rider-maya-lin',
      quantity: 40,
      dependency: 'none',
      status: 'claimed',
      expires_at: inMinutes(75),
      claimed_at: agoMinutes(2),
      confirmation_deadline: inMinutes(3),
      heartbeat_at: agoSeconds(25),
      picked_up_at: null,
      delivered_at: null,
      created_at: agoMinutes(20),
      shelter: {
        id: 'shelter-mission-kitchen',
        name: 'Mission Community Kitchen',
        latitude: 37.7599,
        longitude: -122.4148,
      },
    },
    {
      id: 'sub-batch-fd-02a',
      batch_id: 'batch-fresh-dairy-02',
      shelter_id: 'shelter-hope-downtown',
      rider_id: null,
      quantity: 40,
      dependency: 'water',
      status: 'available',
      expires_at: inMinutes(45),
      claimed_at: null,
      confirmation_deadline: null,
      heartbeat_at: null,
      picked_up_at: null,
      delivered_at: null,
      created_at: agoMinutes(15),
      shelter: {
        id: 'shelter-hope-downtown',
        name: 'Downtown Hope Shelter',
        latitude: 37.7749,
        longitude: -122.4194,
      },
    },
    {
      id: 'sub-batch-fd-02b',
      batch_id: 'batch-fresh-dairy-02',
      shelter_id: 'shelter-harbor-refuge',
      rider_id: null,
      quantity: 20,
      dependency: 'water',
      status: 'available',
      expires_at: inMinutes(45),
      claimed_at: null,
      confirmation_deadline: null,
      heartbeat_at: null,
      picked_up_at: null,
      delivered_at: null,
      created_at: agoMinutes(15),
      shelter: {
        id: 'shelter-harbor-refuge',
        name: 'Harbor Family Refuge',
        latitude: 37.7955,
        longitude: -122.3937,
      },
    },
  ];

  const riders: Rider[] = [
    {
      profile_id: 'demo-rider',
      status: 'busy',
      vehicle_capacity: 40,
      last_heartbeat_at: agoSeconds(18),
      latitude: 37.7833,
      longitude: -122.4167,
      display_name: 'Alex Chen (Cargo Fleet)',
    },
    {
      profile_id: 'rider-maya-lin',
      status: 'busy',
      vehicle_capacity: 40,
      last_heartbeat_at: agoSeconds(25),
      latitude: 37.7689,
      longitude: -122.4182,
      display_name: 'Maya Lin (Scooter)',
    },
    {
      profile_id: 'rider-jordan-smith',
      status: 'available',
      vehicle_capacity: 40,
      last_heartbeat_at: agoSeconds(45),
      latitude: 37.7712,
      longitude: -122.4089,
      display_name: 'Jordan Smith (E-Bike)',
    },
    {
      profile_id: 'rider-samira-patel',
      status: 'needs_check',
      vehicle_capacity: 40,
      last_heartbeat_at: agoSeconds(95),
      latitude: 37.7891,
      longitude: -122.4012,
      display_name: 'Samira Patel (Cargo Bike)',
    },
  ];

  const audit: ClaimAudit[] = [
    {
      id: 'audit-01',
      batch_id: 'batch-prepared-meals-01',
      sub_batch_id: 'sub-batch-pm-01a',
      actor_id: 'demo-rider',
      event: 'picked_up',
      created_at: agoMinutes(10),
      details: { vehicle_capacity: 40, destination: 'Downtown Hope Shelter' },
    },
    {
      id: 'audit-02',
      batch_id: 'batch-prepared-meals-01',
      sub_batch_id: 'sub-batch-pm-01b',
      actor_id: 'rider-maya-lin',
      event: 'claimed',
      created_at: agoMinutes(2),
      details: { deadline_minutes: 5, target: 'Mission Community Kitchen' },
    },
    {
      id: 'audit-03',
      batch_id: 'batch-prepared-meals-01',
      sub_batch_id: null,
      actor_id: 'demo-donor',
      event: 'batch_split',
      created_at: agoMinutes(20),
      details: { original_quantity: 80, sub_batches: 2, cap: 40 },
    },
    {
      id: 'audit-04',
      batch_id: 'batch-fresh-dairy-02',
      sub_batch_id: null,
      actor_id: 'demo-donor',
      event: 'batch_created',
      created_at: agoMinutes(15),
      details: { quantity: 60, dependency: 'water' },
    },
  ];

  return {
    profile: { id: 'demo-admin', display_name: 'Judge / Evaluator', role: 'admin' },
    batches,
    subBatches,
    shelters,
    riders,
    audit,
  };
}

class DemoStore {
  private data: DashboardData;
  private listeners = new Set<() => void>();
  private activeProfile: Profile | null = null;

  constructor() {
    this.data = this.loadFromStorage() ?? getInitialDemoData();
    this.activeProfile = this.loadUserFromStorage() ?? this.data.profile;
  }

  private loadFromStorage(): DashboardData | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(DEMO_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as DashboardData) : null;
    } catch {
      return null;
    }
  }

  private saveToStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // storage quota or disabled
    }
  }

  private loadUserFromStorage(): Profile | null {
    if (typeof sessionStorage === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(DEMO_USER_KEY);
      return raw ? (JSON.parse(raw) as Profile) : null;
    } catch {
      return null;
    }
  }

  private saveUserToStorage(profile: Profile | null) {
    if (typeof sessionStorage === 'undefined') return;
    try {
      if (profile) sessionStorage.setItem(DEMO_USER_KEY, JSON.stringify(profile));
      else sessionStorage.removeItem(DEMO_USER_KEY);
    } catch {
      // ignore
    }
  }

  private notify() {
    this.saveToStorage();
    for (const listener of this.listeners) {
      listener();
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshot(): DashboardData {
    return {
      ...this.data,
      profile: this.activeProfile ?? this.data.profile,
    };
  }

  public getActiveProfile(): Profile | null {
    return this.activeProfile;
  }

  public setSessionUser(profile: Profile | null) {
    this.activeProfile = profile;
    this.saveUserToStorage(profile);
    this.notify();
  }

  public switchRole(role: Role) {
    if (!this.activeProfile) return;
    const currentName = this.activeProfile.display_name?.replace(/\s*\([a-zA-Z\s/]+\)$/, '') ?? 'Demo User';
    const roleLabels: Record<Role, string> = {
      admin: 'Judge / Admin View',
      donor: 'Donor View',
      rider: 'Rider View',
      shelter: 'Shelter Lead View',
    };
    const nextProfile: Profile = {
      id: `demo-${role}`,
      display_name: `${currentName} (${roleLabels[role]})`,
      role,
    };
    this.setSessionUser(nextProfile);
  }

  public resetToBaseline() {
    this.data = getInitialDemoData();
    this.notify();
  }

  // --- Operational Actions ---

  public createBatch(quantity: number, dependency: Dependency, expiresAt: string, _requestId?: string): { batch_id: string } {
    const id = `batch-${Date.now()}`;
    const newBatch: Batch = {
      id,
      donor_id: this.activeProfile?.id ?? 'demo-donor',
      quantity,
      dependency,
      status: 'open',
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    };

    this.data.batches.unshift(newBatch);
    this.data.audit.unshift({
      id: `audit-${Date.now()}`,
      batch_id: id,
      sub_batch_id: null,
      actor_id: this.activeProfile?.id ?? 'demo-donor',
      event: 'batch_created',
      created_at: new Date().toISOString(),
      details: { quantity, dependency, expires_at: expiresAt },
    });

    this.splitBatch(id);
    return { batch_id: id };
  }

  public splitBatch(batchId: string): void {
    const batch = this.data.batches.find((b) => b.id === batchId);
    if (!batch) return;

    const VEHICLE_CAP = 40;
    let remaining = batch.quantity;
    const now = new Date().toISOString();
    const subBatchIds: string[] = [];
    let chunkIndex = 1;

    // Pick shelters with demand
    const availableShelters = this.data.shelters.filter((s) => s.current_demand > 0);
    let shelterPointer = 0;

    const newSubBatches: SubBatch[] = [];
    while (remaining > 0) {
      const chunkSize = Math.min(remaining, VEHICLE_CAP);
      remaining -= chunkSize;

      const targetShelter = availableShelters.length > 0 ? availableShelters[shelterPointer % availableShelters.length] : this.data.shelters[0];
      shelterPointer++;

      const subId = `${batchId}-sub-${chunkIndex++}`;
      subBatchIds.push(subId);

      newSubBatches.push({
        id: subId,
        batch_id: batchId,
        shelter_id: targetShelter?.id ?? null,
        rider_id: null,
        quantity: chunkSize,
        dependency: batch.dependency,
        status: 'available',
        expires_at: batch.expires_at,
        claimed_at: null,
        confirmation_deadline: null,
        heartbeat_at: null,
        picked_up_at: null,
        delivered_at: null,
        created_at: now,
        shelter: targetShelter ? {
          id: targetShelter.id,
          name: targetShelter.name,
          latitude: targetShelter.latitude,
          longitude: targetShelter.longitude,
        } : null,
      });
    }
    this.data.subBatches.unshift(...newSubBatches);

    batch.status = 'split';
    this.data.audit.unshift({
      id: `audit-${Date.now()}`,
      batch_id: batchId,
      sub_batch_id: null,
      actor_id: this.activeProfile?.id ?? 'system',
      event: 'batch_split',
      created_at: now,
      details: {
        total_quantity: batch.quantity,
        sub_batches_count: subBatchIds.length,
        cap: VEHICLE_CAP,
      },
    });

    this.notify();
  }

  public claimSubBatch(subBatchId: string): void {
    const item = this.data.subBatches.find((s) => s.id === subBatchId);
    if (!item) return;

    const riderId = this.activeProfile?.role === 'rider' ? this.activeProfile.id : 'demo-rider';
    const now = Date.now();

    item.rider_id = riderId;
    item.status = 'claimed';
    item.claimed_at = new Date(now).toISOString();
    item.confirmation_deadline = new Date(now + 5 * 60_000).toISOString(); // 5 min deadline
    item.heartbeat_at = new Date(now).toISOString();

    this.data.audit.unshift({
      id: `audit-${Date.now()}`,
      batch_id: item.batch_id,
      sub_batch_id: item.id,
      actor_id: riderId,
      event: 'claimed',
      created_at: new Date(now).toISOString(),
      details: { deadline_minutes: 5, shelter_id: item.shelter_id },
    });

    this.notify();
  }

  public confirmPickup(subBatchId: string): void {
    const item = this.data.subBatches.find((s) => s.id === subBatchId);
    if (!item) return;

    // Check dependency violation against shelter
    const shelter = this.data.shelters.find((s) => s.id === item.shelter_id);
    if (shelter) {
      if ((item.dependency === 'water' || item.dependency === 'both') && !shelter.has_water) {
        this.data.audit.unshift({
          id: `audit-${Date.now()}`,
          batch_id: item.batch_id,
          sub_batch_id: item.id,
          actor_id: item.rider_id,
          event: 'dependency_violation',
          created_at: new Date().toISOString(),
          details: { violation: 'potable_water_required', shelter: shelter.name },
        });
        this.notify();
        throw new Error(`Dependency violation: Destination "${shelter.name}" lacks clean water required for this shipment!`);
      }
      if ((item.dependency === 'fuel' || item.dependency === 'both') && !shelter.has_fuel) {
        this.data.audit.unshift({
          id: `audit-${Date.now()}`,
          batch_id: item.batch_id,
          sub_batch_id: item.id,
          actor_id: item.rider_id,
          event: 'dependency_violation',
          created_at: new Date().toISOString(),
          details: { violation: 'cooking_fuel_required', shelter: shelter.name },
        });
        this.notify();
        throw new Error(`Dependency violation: Destination "${shelter.name}" lacks cooking fuel required for this shipment!`);
      }
    }

    const now = new Date().toISOString();
    item.status = 'in_transit';
    item.picked_up_at = now;
    item.heartbeat_at = now;

    this.data.audit.unshift({
      id: `audit-${Date.now()}`,
      batch_id: item.batch_id,
      sub_batch_id: item.id,
      actor_id: item.rider_id,
      event: 'picked_up',
      created_at: now,
      details: { shelter: shelter?.name ?? 'Unknown' },
    });

    this.notify();
  }

  public deliverSubBatch(subBatchId: string): void {
    const item = this.data.subBatches.find((s) => s.id === subBatchId);
    if (!item) return;

    const now = new Date().toISOString();
    item.status = 'delivered';
    item.delivered_at = now;

    // Reduce demand at destination shelter
    const shelter = this.data.shelters.find((s) => s.id === item.shelter_id);
    if (shelter) {
      shelter.current_demand = Math.max(0, shelter.current_demand - item.quantity);
    }

    this.data.audit.unshift({
      id: `audit-${Date.now()}`,
      batch_id: item.batch_id,
      sub_batch_id: item.id,
      actor_id: item.rider_id,
      event: 'delivered',
      created_at: now,
      details: { quantity: item.quantity, shelter: shelter?.name },
    });

    this.notify();
  }

  public heartbeat(subBatchId?: string): void {
    const now = new Date().toISOString();
    if (subBatchId) {
      const item = this.data.subBatches.find((s) => s.id === subBatchId);
      if (item) item.heartbeat_at = now;
    }
    const riderId = this.activeProfile?.id ?? 'demo-rider';
    const rider = this.data.riders.find((r) => r.profile_id === riderId);
    if (rider) {
      rider.last_heartbeat_at = now;
      rider.status = 'available';
    }
    this.notify();
  }

  // --- Judge Stress Testing Scenarios ---

  public runJudgeScenario(scenarioId: string): string {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    if (scenarioId === 'ghost_rider') {
      // Find an active claim, make it exceed dead-man limit (> 90 seconds / deadline expired)
      const claim = this.data.subBatches.find((s) => ['claimed', 'at_risk'].includes(s.status)) ?? this.data.subBatches.find((s) => s.status === 'in_transit');
      if (!claim) {
        // Create a claimed batch to revoke
        const newClaim = this.data.subBatches[0];
        if (newClaim) {
          newClaim.status = 'claimed';
          newClaim.rider_id = 'rider-ghost';
          newClaim.heartbeat_at = new Date(now - 120_000).toISOString();
        }
      }

      const target = claim ?? this.data.subBatches[0];
      if (target) {
        const prevRider = target.rider_id;
        target.status = 'available';
        target.rider_id = null;
        target.claimed_at = null;
        target.confirmation_deadline = null;
        target.heartbeat_at = null;

        this.data.audit.unshift({
          id: `audit-${Date.now()}`,
          batch_id: target.batch_id,
          sub_batch_id: target.id,
          actor_id: 'dead_man_watchdog',
          event: 'dead_man_revoked',
          created_at: nowIso,
          details: {
            reason: 'Heartbeat silent > 90s, confirmation deadline expired',
            previous_rider: prevRider,
            batch_republished: true,
          },
        });
        this.notify();
        return `Ghost Rider detected! Rider claim for Sub-Batch ${target.id.slice(-6)} expired past dead-man threshold. Reservation automatically REVOKED and republished to network.`;
      }
      return 'No active claim found to simulate ghost rider.';
    }

    if (scenarioId === 'shelter_filled') {
      // Find a sub-batch in transit and saturate its shelter
      const inTransit = this.data.subBatches.find((s) => s.status === 'in_transit' && s.shelter_id) ?? this.data.subBatches[0];
      if (targetShelter(inTransit, this.data.shelters)) {
        const oldShelter = this.data.shelters.find((s) => s.id === inTransit?.shelter_id);
        if (oldShelter) {
          oldShelter.current_demand = 0; // Filled to 100% capacity!
        }

        // Reroute to alternate shelter with demand
        const alternate = this.data.shelters.find((s) => s.id !== oldShelter?.id && s.current_demand > 0) ?? this.data.shelters[1];
        if (inTransit && alternate) {
          const prevShelterName = oldShelter?.name ?? 'Previous Shelter';
          inTransit.shelter_id = alternate.id;
          inTransit.shelter = {
            id: alternate.id,
            name: alternate.name,
            latitude: alternate.latitude,
            longitude: alternate.longitude,
          };

          this.data.audit.unshift({
            id: `audit-${Date.now()}`,
            batch_id: inTransit.batch_id,
            sub_batch_id: inTransit.id,
            actor_id: 'reroute_engine',
            event: 'rerouted',
            created_at: nowIso,
            details: {
              previous_destination: prevShelterName,
              new_destination: alternate.name,
              reason: 'Shelter reached 100% demand mid-transit. Dynamic fallback engaged.',
            },
          });
          this.notify();
          return `Destination Shock: "${prevShelterName}" filled to capacity mid-route! Dynamic Rerouter retargeted rider in realtime to "${alternate.name}" (${alternate.current_demand} units needed).`;
        }
      }
      return 'Shelter filled scenario executed.';
    }

    if (scenarioId === 'dependency_violation') {
      // Find or create sub-batch with water dependency directed to Harbor Refuge (which lacks water)
      const harbor = this.data.shelters.find((s) => !s.has_water);
      const sub = this.data.subBatches.find((s) => s.dependency === 'water') ?? this.data.subBatches[0];
      if (sub && harbor) {
        sub.dependency = 'water';
        sub.shelter_id = harbor.id;
        sub.shelter = {
          id: harbor.id,
          name: harbor.name,
          latitude: harbor.latitude,
          longitude: harbor.longitude,
        };

        this.data.audit.unshift({
          id: `audit-${Date.now()}`,
          batch_id: sub.batch_id,
          sub_batch_id: sub.id,
          actor_id: 'gatekeeper',
          event: 'dependency_violation',
          created_at: nowIso,
          details: {
            violation: 'water_required',
            shelter: harbor.name,
            action_blocked: 'pickup_prevented',
          },
        });
        this.notify();
        return `Dependency Trap Triggered: Attempted dispatch of water-dependent formula to "${harbor.name}", which has an active clean water outage. Dispatch BLOCKED at gate.`;
      }
      return 'Dependency violation simulated.';
    }

    if (scenarioId === 'split_180') {
      // Create a 180-unit donation and split against 40-unit vehicle cap
      const expiresAt = new Date(now + 75 * 60_000).toISOString(); // 75 mins shelf life
      this.createBatch(180, 'none', expiresAt);
      return 'Bulk Split Injected: 180 cooked banquet meals (75-minute shelf-life) instantly fractured into five 40/20-unit sub-batches respecting volunteer scooter caps.';
    }

    if (scenarioId === 'reset') {
      this.resetToBaseline();
      return 'Demo state restored to clean initial benchmark.';
    }

    return `Executed scenario: ${scenarioId}`;
  }
}

function targetShelter(item: SubBatch | undefined, shelters: Shelter[]): Shelter | undefined {
  if (!item || !item.shelter_id) return shelters[0];
  return shelters.find((s) => s.id === item.shelter_id);
}

export const demoStore = new DemoStore();
