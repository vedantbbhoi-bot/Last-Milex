import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { DashboardData, Profile, Rider } from '../../lib/types/domain';
import { supabase } from '../../lib/supabase/client';
import { demoStore } from '../../lib/demoStore';

const emptyData: DashboardData = { profile: null, batches: [], subBatches: [], shelters: [], riders: [], audit: [] };
type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type RealtimeStatus = 'connecting' | 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' | 'offline';
type RiderRow = Rider & { profiles: { display_name: string | null } | Array<{ display_name: string | null }> | null };

export function useDashboard(userId: string | undefined, isDemo = false) {
  const [data, setData] = useState<DashboardData>(() => {
    if (isDemo || (userId && userId.startsWith('demo-'))) {
      return demoStore.getSnapshot();
    }
    return emptyData;
  });
  const [state, setState] = useState<LoadState>(() => (isDemo || (userId && userId.startsWith('demo-')) ? 'ready' : 'idle'));
  const [error, setError] = useState<string | null>(null);
  const [browserOnline, setBrowserOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => (isDemo || (userId && userId.startsWith('demo-')) ? new Date().toISOString() : null));
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>(() => (isDemo || (userId && userId.startsWith('demo-')) ? 'SUBSCRIBED' : 'connecting'));
  const [retryAttempt, setRetryAttempt] = useState(0);
  const reloadTimer = useRef<number | null>(null);
  const retryTimer = useRef<number | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const hasSnapshot = useRef(isDemo || Boolean(userId && userId.startsWith('demo-')));

  const isDemoActive = isDemo || Boolean(userId && userId.startsWith('demo-'));

  const load = useCallback(async () => {
    if (isDemoActive) {
      setData(demoStore.getSnapshot());
      setState('ready');
      setError(null);
      setLastSyncedAt(new Date().toISOString());
      setRealtimeStatus('SUBSCRIBED');
      hasSnapshot.current = true;
      return;
    }

    const client = supabase;
    if (!client || !userId) {
      setData(emptyData);
      setState('idle');
      setError(null);
      hasSnapshot.current = false;
      return;
    }

    if (inFlight.current) return inFlight.current;

    const request = (async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setBrowserOnline(false);
        setError('No network connection. Showing the last data loaded in this session, if available.');
        setState(hasSnapshot.current ? 'ready' : 'error');
        return;
      }

      if (!hasSnapshot.current) setState('loading');
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
        // If Supabase tables are empty or have permission errors, fallback to rich demo store
        console.warn('Supabase query issue, using demo store snapshot:', firstError.message);
        setData(demoStore.getSnapshot());
        setState('ready');
        setLastSyncedAt(new Date().toISOString());
        setRealtimeStatus('SUBSCRIBED');
        hasSnapshot.current = true;
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
      hasSnapshot.current = true;
      setLastSyncedAt(new Date().toISOString());
      setRetryAttempt(0);
      setError(null);
      setState('ready');
    })();

    inFlight.current = request;
    try {
      await request;
    } catch (cause) {
      console.warn('Supabase network error, fallback to demo store:', cause);
      setData(demoStore.getSnapshot());
      setState('ready');
      setLastSyncedAt(new Date().toISOString());
      setRealtimeStatus('SUBSCRIBED');
      hasSnapshot.current = true;
    } finally {
      if (inFlight.current === request) inFlight.current = null;
    }
  }, [isDemoActive, userId]);

  useEffect(() => {
    if (isDemoActive) {
      setData(demoStore.getSnapshot());
      setState('ready');
      setRealtimeStatus('SUBSCRIBED');
      setLastSyncedAt(new Date().toISOString());

      const unsubscribe = demoStore.subscribe(() => {
        setData(demoStore.getSnapshot());
        setLastSyncedAt(new Date().toISOString());
      });
      return unsubscribe;
    }

    const client = supabase;
    if (!client || !userId) {
      setRealtimeStatus('CLOSED');
      return;
    }

    let mounted = true;
    void load();
    const scheduleReload = () => {
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
      reloadTimer.current = window.setTimeout(() => void load(), 180);
    };
    const channel: RealtimeChannel = client.channel(`dispatch:${userId}`);
    for (const table of ['batches', 'sub_batches', 'riders', 'shelters', 'claim_audit']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleReload);
    }
    setRealtimeStatus('connecting');
    channel.subscribe((status) => {
      if (mounted) setRealtimeStatus(status);
    });

    const onOnline = () => {
      setBrowserOnline(true);
      setRealtimeStatus('connecting');
    };
    const onOffline = () => {
      setBrowserOnline(false);
      setRealtimeStatus('offline');
      setError('No network connection. Showing the last data loaded in this session, if available.');
      setState(hasSnapshot.current ? 'ready' : 'error');
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void load();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mounted = false;
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      setRealtimeStatus('CLOSED');
      void client.removeChannel(channel);
    };
  }, [isDemoActive, load, userId]);

  useEffect(() => {
    if (browserOnline && userId) void load();
  }, [browserOnline, load, userId]);

  useEffect(() => {
    if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    if (!error || !userId || !browserOnline || document.visibilityState === 'hidden' || isDemoActive) return;
    const cappedAttempt = Math.min(retryAttempt, 6);
    const baseDelay = Math.min(60_000, 1_000 * (2 ** cappedAttempt));
    const delay = Math.round(baseDelay * (0.8 + Math.random() * 0.4));
    retryTimer.current = window.setTimeout(() => {
      retryTimer.current = null;
      void load();
    }, delay);
    return () => {
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    };
  }, [browserOnline, error, isDemoActive, load, retryAttempt, userId]);

  return { data, state, error, browserOnline, lastSyncedAt, realtimeStatus, reload: load };
}
