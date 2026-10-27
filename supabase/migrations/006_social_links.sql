-- =============================================================================
-- 006_social_links.sql — any number of social media links per vendor.
--
-- CONCEPT: vendors vary: one has Facebook + Instagram + TikTok, another only
-- Shopee, another nothing. Instead of a fixed column per platform, store a
-- simple list of URLs. The app recognises the platform from each URL's
-- domain (lib/util.ts socialPlatform), so new platforms need no DB change.
--
-- `website` stays a separate single field for the vendor's own site.
-- Earlier, the form suggested putting social pages into `website`; any
-- website that is really a social URL is moved into the list here.
--
-- Safe to run more than once.
-- =============================================================================

alter table vendors add column if not exists social_links text[] not null default '{}';

-- Move social-media URLs that were typed into `website` over to the list.
update vendors
   set social_links = array_append(social_links, website),
       website = null
 where website ~* '^(https?://)?([a-z0-9-]+\.)*(facebook|fb|instagram|tiktok|youtube|youtu|twitter|x|linkedin|threads|shopee|lazada|wa)\.(com|me|be|net|my|co)(/|$)'
   and not (website = any(social_links));
