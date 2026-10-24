CREATE OR REPLACE FUNCTION heartbeat(p_sub_batch_id UUID)
RETURNS VOID AS $$
  UPDATE sub_batches
  SET heartbeat_at = NOW()
  WHERE id = p_sub_batch_id
    AND assigned_rider_id = auth.uid()
    AND status IN ('claimed','confirmed','in_transit');
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION dead_man_sweep()
RETURNS INTEGER AS $$
DECLARE v_count INTEGER;
BEGIN
  WITH revoked AS (
    UPDATE sub_batches
    SET status = 'unassigned',
        assigned_rider_id = NULL,
        claimed_at = NULL,
        confirmation_deadline = NULL,
        heartbeat_at = NULL
    WHERE status IN ('claimed','confirmed')
      AND (
        (confirmation_deadline IS NOT NULL AND NOW() > confirmation_deadline)
        OR (heartbeat_at IS NOT NULL AND heartbeat_at < NOW() - INTERVAL '90 seconds')
      )
    RETURNING id
  )
  INSERT INTO claim_audit(sub_batch_id, event, metadata)
  SELECT id, 'dead_man_revoked', jsonb_build_object('at', NOW()) FROM revoked;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;