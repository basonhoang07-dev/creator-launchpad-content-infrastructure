-- Adds an optional due-date/deadline phrase to each recap action item (e.g.
-- "this month", "Wed", "by Friday") — only ever populated when the call
-- transcript actually mentions one, never fabricated. Lets the Discord
-- recap embed match the "Action — Due X" format Akira's own coach's bot
-- (Nova) already uses, instead of a bare task list.

alter table recap_action_items add column due text;
