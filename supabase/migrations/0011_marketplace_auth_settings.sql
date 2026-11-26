-- FINO Marketplace Stage 1: auth profile fields, settings, marketplace foundation.
-- Apply after 0010. No service-role secrets in client code.

-- ---------------------------------------------------------------------------
-- Profile / verification extensions (one account across pillars)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists phone_e164 text,
  add column if not exists phone_country text,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists email_verified_at timestamptz,
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'pending_verification', 'deactivated', 'deleted'));

create unique index if not exists profiles_phone_e164_uidx
  on public.profiles (phone_e164) where phone_e164 is not null;

-- ---------------------------------------------------------------------------
-- Expanded preferences (privacy, notifications, marketplace prefs)
-- ---------------------------------------------------------------------------
alter table public.user_preferences
  add column if not exists currency text not null default 'USD',
  add column if not exists country_code text,
  add column if not exists privacy jsonb not null default '{
    "profile_visibility": "public",
    "who_can_contact": "everyone",
    "show_activity": true,
    "show_online": true
  }'::jsonb,
  add column if not exists notifications jsonb not null default '{
    "push": true,
    "email": true,
    "sms": false,
    "orders": true,
    "messages": true,
    "promotions": false
  }'::jsonb,
  add column if not exists accessibility jsonb not null default '{
    "reduced_motion": false,
    "large_text": false,
    "high_contrast": false
  }'::jsonb;

-- ---------------------------------------------------------------------------
-- OTP attempt log (abuse protection; clients call check RPC before send)
-- ---------------------------------------------------------------------------
create table if not exists public.auth_otp_attempts (
  id bigserial primary key,
  identifier text not null,
  channel text not null check (channel in ('sms', 'email')),
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists auth_otp_attempts_ident_idx
  on public.auth_otp_attempts (identifier, created_at desc);

alter table public.auth_otp_attempts enable row level security;
-- No client SELECT/INSERT policies — only SECURITY DEFINER functions

create or replace function public.auth_check_otp_rate(
  p_identifier text,
  p_channel text
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  recent integer;
begin
  if p_identifier is null or length(trim(p_identifier)) < 3 then
    raise exception 'invalid identifier';
  end if;
  if p_channel not in ('sms', 'email') then
    raise exception 'invalid channel';
  end if;

  select count(*) into recent
  from public.auth_otp_attempts
  where identifier = lower(trim(p_identifier))
    and channel = p_channel
    and created_at > now() - interval '15 minutes';

  if recent >= 5 then
    raise exception 'too many verification attempts — try again later';
  end if;

  insert into public.auth_otp_attempts (identifier, channel)
  values (lower(trim(p_identifier)), p_channel);

  return true;
end;
$$;
revoke all on function public.auth_check_otp_rate(text, text) from public;
grant execute on function public.auth_check_otp_rate(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Login / session audit (best-effort; client may insert own rows)
-- ---------------------------------------------------------------------------
create table if not exists public.auth_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('login', 'logout', 'password_reset', 'otp_verified', 'failed_login')),
  channel text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists auth_login_events_user_idx
  on public.auth_login_events (user_id, created_at desc);

alter table public.auth_login_events enable row level security;

create policy "Users read own login events"
  on public.auth_login_events for select to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own login events"
  on public.auth_login_events for insert to authenticated
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Marketplace foundation (Stage 1 structures only)
-- ---------------------------------------------------------------------------
create table if not exists public.marketplace_categories (
  id text primary key,
  title text not null,
  parent_id text references public.marketplace_categories(id) on delete set null,
  sort_order integer not null default 0
);

insert into public.marketplace_categories (id, title, sort_order) values
  ('electronics', 'Electronics', 1),
  ('fashion', 'Fashion', 2),
  ('home', 'Home & Living', 3),
  ('services', 'Services', 4),
  ('food', 'Food & Grocery', 5)
on conflict do nothing;

create table if not exists public.marketplace_seller_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  shop_name text not null,
  bio text not null default '',
  logo_url text,
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketplace_seller_profiles enable row level security;

create policy "Anyone can read active sellers"
  on public.marketplace_seller_profiles for select to authenticated
  using (status = 'active' or user_id = auth.uid());

create policy "Users manage own seller profile"
  on public.marketplace_seller_profiles for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.marketplace_products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  category_id text references public.marketplace_categories(id) on delete set null,
  title text not null,
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'USD',
  status text not null default 'draft'
    check (status in ('draft', 'active', 'sold_out', 'archived')),
  cover_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketplace_products_seller_idx on public.marketplace_products (seller_id);
create index if not exists marketplace_products_status_idx on public.marketplace_products (status, created_at desc);

alter table public.marketplace_products enable row level security;

create policy "Read active products"
  on public.marketplace_products for select to authenticated
  using (status = 'active' or seller_id = auth.uid());

create policy "Sellers manage own products"
  on public.marketplace_products for all to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());

create table if not exists public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'shipped', 'completed', 'cancelled', 'refunded')),
  total_cents integer not null default 0 check (total_cents >= 0),
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketplace_orders_buyer_idx on public.marketplace_orders (buyer_id, created_at desc);
create index if not exists marketplace_orders_seller_idx on public.marketplace_orders (seller_id, created_at desc);

alter table public.marketplace_orders enable row level security;

create policy "Buyers and sellers read own orders"
  on public.marketplace_orders for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid());

-- Role helper: buyer is default; seller = has marketplace_seller_profiles row
create or replace function public.is_marketplace_seller(p_uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.marketplace_seller_profiles
    where user_id = p_uid and status in ('active', 'pending', 'draft')
  );
$$;
revoke all on function public.is_marketplace_seller(uuid) from public;
grant execute on function public.is_marketplace_seller(uuid) to authenticated;

-- Ensure profile row on signup (if not already handled)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, account_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, new.phone, 'user'), '@', 1)),
    'pending_verification'
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
