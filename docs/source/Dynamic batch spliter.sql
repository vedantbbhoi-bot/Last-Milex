CREATE OR REPLACE FUNCTION split_batch(p_batch_id UUID)
RETURNS SETOF sub_batches AS $$
DECLARE
  v_batch       batches%ROWTYPE;
  v_vehicle_cap INTEGER;
  v_remaining   INTEGER;
  v_chunk       INTEGER;
  v_shelter     RECORD;
BEGIN
  SELECT * INTO v_batch FROM batches WHERE id = p_batch_id FOR UPDATE;
  IF v_batch.status <> 'pending_split' THEN RAISE EXCEPTION 'Batch already split'; END IF;

  SELECT MIN(vehicle_capacity) INTO v_vehicle_cap FROM riders WHERE status = 'idle';
  v_remaining := v_batch.total_quantity;

  FOR v_shelter IN
    SELECT id, current_demand, resources
    FROM shelters
    WHERE current_demand > 0
      AND (v_batch.dependency = 'none'
           OR (v_batch.dependency = 'water' AND (resources->>'water')::boolean)
           OR (v_batch.dependency = 'fuel'  AND (resources->>'fuel')::boolean)
           OR (v_batch.dependency = 'both'  AND (resources->>'water')::boolean AND (resources->>'fuel')::boolean))
    ORDER BY current_demand DESC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_chunk := LEAST(v_remaining, v_vehicle_cap, v_shelter.current_demand);
    INSERT INTO sub_batches(parent_batch_id, quantity, dependency, expires_at, assigned_shelter_id)
    VALUES (p_batch_id, v_chunk, v_batch.dependency, v_batch.expires_at, v_shelter.id);
    v_remaining := v_remaining - v_chunk;
  END LOOP;

  IF v_remaining > 0 THEN
    INSERT INTO sub_batches(parent_batch_id, quantity, dependency, expires_at)
    VALUES (p_batch_id, v_remaining, v_batch.dependency, v_batch.expires_at);
  END IF;

  UPDATE batches SET status = 'split_complete' WHERE id = p_batch_id;
  RETURN QUERY SELECT * FROM sub_batches WHERE parent_batch_id = p_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;