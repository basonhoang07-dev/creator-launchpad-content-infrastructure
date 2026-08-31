-- The lead's full name, and a normalised phone number.
--
-- first_name was all the funnel asked for, which is fine for a greeting and
-- useless on a call sheet: "Sarah" among three hundred rows is not somebody
-- you can look up before you ring them. The funnel now asks for both names.
--
-- Kept alongside first_name rather than replacing it — the greeting still
-- wants the first name on its own, and rewriting existing rows to guess a
-- surname they never gave would be inventing data.

alter table leads add column if not exists full_name text;

-- E.164, assembled from the country selector the funnel now shows. The old
-- rows kept whatever shape the visitor typed, which is why this is a new
-- column rather than a rewrite of phone: there is no reliable way to infer
-- a country code after the fact.
alter table leads add column if not exists phone_e164 text;
