export type Role = 'donor' | 'rider' | 'shelter' | 'admin';
export type Dependency = 'none' | 'water' | 'fuel' | 'both';
export type BatchStatus = 'open' | 'split' | 'in_transit' | 'partially_spoiled' | 'fully_spoiled' | 'completed';
export type SubBatchStatus = 'available' | 'claimed' | 'in_transit' | 'delivered' | 'spoiled' | 'at_risk' | 'cancelled';
export type RiderStatus = 'available' | 'busy' | 'offline' | 'needs_check';

export interface Profile {
  id: string;
  display_name: string | null;
  role: Role;
}

export interface Batch {
  id: string;
  donor_id: string;
  quantity: number;
  dependency: Dependency;
  status: BatchStatus;
  expires_at: string;
  created_at: string;
}

export interface SubBatch {
  id: string;
  batch_id: string;
  shelter_id: string | null;
  rider_id: string | null;
  quantity: number;
  dependency: Dependency;
  status: SubBatchStatus;
  expires_at: string;
  claimed_at: string | null;
  confirmation_deadline: string | null;
  heartbeat_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  created_at: string;
  shelter?: Pick<Shelter, 'id' | 'name' | 'latitude' | 'longitude'> | null;
  batch?: Pick<Batch, 'id' | 'donor_id' | 'quantity' | 'status'> | null;
}

export interface Shelter {
  id: string;
  name: string;
  capacity: number;
  current_demand: number;
  has_water: boolean;
  has_fuel: boolean;
  latitude: number;
  longitude: number;
}

export interface Rider {
  profile_id: string;
  status: RiderStatus;
  vehicle_capacity: number;
  last_heartbeat_at: string | null;
  latitude: number | null;
  longitude: number | null;
  display_name?: string | null;
}

export interface ClaimAudit {
  id: string;
  batch_id: string | null;
  sub_batch_id: string | null;
  actor_id: string | null;
  event: string;
  created_at: string;
  details: Record<string, unknown>;
}

export interface DashboardData {
  profile: Profile | null;
  batches: Batch[];
  subBatches: SubBatch[];
  shelters: Shelter[];
  riders: Rider[];
  audit: ClaimAudit[];
}
