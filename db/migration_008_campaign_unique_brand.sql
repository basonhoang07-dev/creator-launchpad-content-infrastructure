-- Prevents two retainer_campaigns rows for the same brand under the same
-- client — found a duplicate "Creator Launchpad" campaign on Akira Testing
-- (harmless for the calendar's board tabs since those dedupe by name, but
-- KPI Trackers picks whichever row comes back first, which is ambiguous
-- with two identical rows). The app's own "New board" wizard already blocks
-- this client-side; this just makes it impossible at the DB level too,
-- matching the same guard brand_profiles already has.

alter table retainer_campaigns add constraint retainer_campaigns_client_brand_unique unique (client_id, brand);
