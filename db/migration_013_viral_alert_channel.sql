-- Lets Viral Alerts post somewhere other than the client's 1-on-1 support
-- channel — e.g. a dedicated "🚨⎜viral-alerts" channel, which can live in a
-- different Discord server entirely (the bot just has to be a member of it).
--
-- Null = fall back to the existing behaviour: the client's discord_channel_id,
-- or name-matched 1-on-1 channel. Recaps and weekly check-ins are unaffected;
-- they keep using discord_channel_id regardless.

alter table clients add column if not exists viral_alert_channel_id text;
