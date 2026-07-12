BEGIN;

DROP TRIGGER IF EXISTS post_meeting_digests_set_updated_at ON post_meeting_digests;
DROP TRIGGER IF EXISTS user_notification_preferences_set_updated_at ON user_notification_preferences;
DROP INDEX IF EXISTS post_meeting_digests_due_idx;
DROP TABLE IF EXISTS post_meeting_digests;
DROP TABLE IF EXISTS user_notification_preferences;

DELETE FROM schema_migrations
WHERE name = '008_post_meeting_digests.sql';

COMMIT;
