-- Baseline marker for the D1 migration ledger.
-- The notification target column and index were applied to production before
-- tracked migrations were introduced. Fresh databases are created from the
-- current schema.sql, which already contains this structure.
SELECT 1;
