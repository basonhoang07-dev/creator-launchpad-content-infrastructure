-- Stores the Drive folder's raw id alongside its url on calendar_entries, so
-- permanently deleting a script (Trash → Delete forever) can trash the
-- matching Drive folder without having to parse the id back out of a URL.
-- Idempotent — safe to run even if already applied.

alter table calendar_entries add column if not exists drive_folder_id text;
