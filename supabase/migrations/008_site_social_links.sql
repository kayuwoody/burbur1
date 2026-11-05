-- =============================================================================
-- 008_site_social_links.sql — the market's own social media links.
--
-- CONCEPT: same idea as vendors.social_links (006): a plain list of URLs,
-- platform recognised from the domain. Shown as "Follow us" links in the
-- public website footer; editable in Admin → Settings.
-- Pre-filled with the Good Vibes Only Market Facebook page.
-- Safe to run more than once.
-- =============================================================================

alter table settings add column if not exists social_links text[] not null default '{}';

update settings
   set social_links = array['https://www.facebook.com/profile.php?id=61592121695936']
 where id = 1 and social_links = '{}';
