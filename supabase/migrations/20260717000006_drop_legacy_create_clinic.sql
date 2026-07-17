-- The verticals migration created create_clinic(name, slug, tz, vertical)
-- alongside the original 3-arg version instead of replacing it. Because the
-- 4-arg version defaults p_vertical, any 3-named-arg RPC call is now ambiguous
-- ("Could not choose the best candidate function"). Keep only the 4-arg one.
drop function if exists public.create_clinic(text, text, text);
