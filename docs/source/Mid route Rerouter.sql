CREATE OR REPLACE FUNCTION find_alternative_shelter(p_sub_batch_id UUID)
RETURNS TABLE(shelter_id UUID, eta_seconds INTEGER) AS $$
DECLARE
  v_dep       TEXT;
  v_deadline  TIMESTAMPTZ;
  v_from_geo  GEOGRAPHY;
BEGIN
  SELECT sb.dependency, sb.expires_at INTO v_dep, v_deadline
  FROM sub_batches sb WHERE sb.id = p_sub_batch_id;

  SELECT location INTO v_from_geo FROM riders
  WHERE id = (SELECT assigned_rider_id FROM sub_batches WHERE id = p_sub_batch_id);

  RETURN QUERY
  SELECT s.id, (ST_Distance(s.location, v_from_geo) / 8.33)::INTEGER
  FROM shelters s
  WHERE s.current_demand > 0
    AND (v_dep = 'none'
         OR (v_dep = 'water' AND (s.resources->>'water')::boolean)
         OR (v_dep = 'fuel'  AND (s.resources->>'fuel')::boolean)
         OR (v_dep = 'both'  AND (s.resources->>'water')::boolean AND (s.resources->>'fuel')::boolean))
    AND (ST_Distance(s.location, v_from_geo) / 8.33) < EXTRACT(EPOCH FROM (v_deadline - NOW())) - 300
  ORDER BY ST_Distance(s.location, v_from_geo) ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;