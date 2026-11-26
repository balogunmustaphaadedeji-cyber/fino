-- Email-only verification policy helpers.
-- Phone remains on profiles for identity / password login; no SMS OTP.

create or replace function public.auth_email_for_phone(p_phone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  normalized text;
begin
  if p_phone is null or length(trim(p_phone)) < 8 then
    return null;
  end if;
  normalized := regexp_replace(trim(p_phone), '\s+', '', 'g');

  select u.email into v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.phone_e164 = normalized
     or p.phone_e164 = '+' || ltrim(normalized, '+')
  limit 1;

  return v_email;
end;
$$;

revoke all on function public.auth_email_for_phone(text) from public;
grant execute on function public.auth_email_for_phone(text) to anon, authenticated;

comment on function public.auth_email_for_phone(text) is
  'Resolves login email from phone_e164 for password sign-in. Client must not reveal whether a phone exists; use generic auth errors.';
