BEGIN;

DROP INDEX IF EXISTS oauth_authorization_states_owner_idx;
DROP INDEX IF EXISTS oauth_authorization_states_expiry_idx;
DROP TABLE IF EXISTS oauth_authorization_states;

DELETE FROM schema_migrations
WHERE name = '005_google_calendar_oauth.sql';

COMMIT;
