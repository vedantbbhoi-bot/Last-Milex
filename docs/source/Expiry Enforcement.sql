UPDATE sub_batches
SET status = 'spoiled'
WHERE expires_at < NOW() AND status NOT IN ('delivered','spoiled');