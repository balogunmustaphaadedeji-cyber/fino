import { supabase } from '../../../lib/supabase';
import type { MarketCategory, SellerProfile, Product } from '../types';

function client() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

export async function listCategories(): Promise<MarketCategory[]> {
  const { data, error } = await client()
    .from('marketplace_categories')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as MarketCategory[];
}

export async function getMySellerProfile(): Promise<SellerProfile | null> {
  const { data: session } = await client().auth.getSession();
  const uid = session.session?.user?.id;
  if (!uid) return null;
  const { data, error } = await client()
    .from('marketplace_seller_profiles')
    .select('*')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  return data as SellerProfile | null;
}

export async function upsertSellerProfile(input: {
  shop_name: string;
  bio?: string;
}): Promise<SellerProfile> {
  const { data: session } = await client().auth.getSession();
  const uid = session.session?.user?.id;
  if (!uid) throw new Error('Not authenticated');
  const { data, error } = await client()
    .from('marketplace_seller_profiles')
    .upsert({
      user_id: uid,
      shop_name: input.shop_name.trim(),
      bio: input.bio ?? '',
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data as SellerProfile;
}

export async function listActiveProducts(limit = 24): Promise<Product[]> {
  const { data, error } = await client()
    .from('marketplace_products')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Product[];
}
