export type SellerStatus = 'draft' | 'pending' | 'active' | 'suspended';
export type ProductStatus = 'draft' | 'active' | 'sold_out' | 'archived';
export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled' | 'refunded';

export interface MarketCategory {
  id: string;
  title: string;
  parent_id: string | null;
  sort_order: number;
}

export interface SellerProfile {
  user_id: string;
  shop_name: string;
  bio: string;
  logo_url: string | null;
  status: SellerStatus;
  created_at: string;
}

export interface Product {
  id: string;
  seller_id: string;
  category_id: string | null;
  title: string;
  description: string;
  price_cents: number;
  currency: string;
  status: ProductStatus;
  cover_url: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  buyer_id: string;
  seller_id: string;
  status: OrderStatus;
  total_cents: number;
  currency: string;
  created_at: string;
}
