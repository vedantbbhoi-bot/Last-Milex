import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardData, Profile, Rider } from '../../lib/types/domain';
import { supabase } from '../../lib/supabase/client';

const emptyData: DashboardData = { profile: null, batches: [], subBatches: [], shelters: [], riders: [], audit: [] };
type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type RiderRow = Rider & { profiles: { display_name: string | null } | Array<{ display_name: string | null }> | null };

export function useDashboard(userId: string | undefined) {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [state, setState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const reloadTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const client = supabase;
    if (!client || !userId) {
      setData(emptyData);
      setState('idle');
      return;
    }
    setState((current) => (current === 'ready' ? current : 'loading'));
    setError(null);
    const [profileResult, batchesResult, subBatchesResult, sheltersResult, ridersResult, auditResult] = await Promise.all([
      client.from('profiles').select('id,display_name,role').eq('id', userId).maybeSingle(),
      client.from('batches').select('id,donor_id,quantity,dependency,status,expires_at,created_at').order('created_at', { ascending: false }).limit(100),
      client.from('sub_batches').select('id,batch_id,shelter_id,rider_id,quantity,dependency,status,expires_at,claimed_at,confirmation_deadline,heartbeat_at,picked_up_at,delivered_at,created_at').order('created_at', { ascending: false }).limit(200),
      client.from('shelters').select('id,name,capacity,current_demand,has_water,has_fuel,latitude,longitude').order('name').limit(100),
      client.from('riders').select('profile_id,status,vehicle_capacity,last_heartbeat_at,latitude,longitude,profiles!riders_profile_id_fkey(display_name)').limit(100),
      client.from('claim_audit').select('id,batch_id,sub_batch_id,actor_id,event,created_at,details').order('created_at', { ascending: false }).limit(200),
    ]);
    const firstError = profileResult.error ?? batchesResult.error ?? subBatchesResult.error ?? sheltersResult.error ?? ridersResult.error ?? auditResult.error;
    if (firstError) {
      setState('error');
      setError(firstError.message);
      return;
    }
    const riderRows = (ridersResult.data ?? []) as unknown as RiderRow[];
    setData({
      profile: (profileResult.data as Profile | null) ?? null,
      batches: batchesResult.data ?? [],
      subBatches: subBatchesResult.data ?? [],
      shelters: sheltersResult.data ?? [],
      riders: riderRows.map((rider) => ({
        profile_id: rider.profile_id,
        status: rider.status,
        vehicle_capacity: rider.vehicle_capacity,
        last_heartbeat_at: rider.last_heartbeat_at,
        latitude: rider.latitude,
        longitude: rider.longitude,
        display_name: Array.isArray(rider.profiles) ? rider.profiles[0]?.display_name ?? null : rider.profiles?.display_name ?? null,
      })),
      audit: auditResult.data ?? [],
    });
    setState('ready');
  }, [userId]);

  useEffect(() => {
    void load();
    const client = supabase;
    if (!client || !userId) return;
    const scheduleReload = () => {
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
      reloadTimer.current = window.setTimeout(() => void load(), 180);
    };
    const channel = client.channel(`dispatch:${userId}`);
    for (const table of ['batches', 'sub_batches', 'riders', 'shelters', 'claim_audit']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleReload);
    }
    channel.subscribe();
    return () => {
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
      void client.removeChannel(channel);
    };
  }, [load, userId]);

  return { data, state, error, reload: load };
}
