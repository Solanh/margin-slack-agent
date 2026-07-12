BEGIN;

DROP TRIGGER IF EXISTS slack_active_contexts_set_updated_at ON slack_active_contexts;
DROP TRIGGER IF EXISTS slack_huddle_states_set_updated_at ON slack_huddle_states;
DROP INDEX IF EXISTS slack_active_contexts_expiry_idx;
DROP INDEX IF EXISTS slack_huddle_states_expiry_idx;
DROP TABLE IF EXISTS slack_active_contexts;
DROP TABLE IF EXISTS slack_huddle_states;

DELETE FROM schema_migrations
WHERE name = '006_slack_context_signals.sql';

COMMIT;
