import { useCallback, useEffect, useState } from 'react';
import { Store, ShoppingBag } from 'lucide-react';
import { useAuth } from '../../shared/auth/AuthProvider';
import AuthPage from '../../shared/auth/AuthPage';
import { listCategories, getMySellerProfile, upsertSellerProfile, listActiveProducts } from './api/client';
import type { MarketCategory, SellerProfile, Product } from './types';
import './marketplace.css';

/**
 * Stage 1 foundation only: roles, categories, seller profile shell, product listing shell.
 * Catalogue, checkout, payments and fulfilment belong to later stages.
 */
export default function MarketplacePage() {
  const { user, loading: authLoading } = useAuth();
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [shopName, setShopName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, prods] = await Promise.all([
        listCategories().catch(() => [] as MarketCategory[]),
        listActiveProducts().catch(() => [] as Product[]),
      ]);
      setCategories(cats);
      setProducts(prods);
      if (user) setSeller(await getMySellerProfile().catch(() => null));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load marketplace');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (authLoading) return <p className="muted">Loading…</p>;

  if (!user) {
    return (
      <section className="market-page">
        <p className="eyebrow">MARKETPLACE</p>
        <h1>Buy & sell on FINO</h1>
        <p className="muted">Sign in with the same FINO account used for Social, Games, Chat and Learn.</p>
        <AuthPage onSuccess={() => void refresh()} />
      </section>
    );
  }

  return (
    <section className="market-page">
      <header className="market-header">
        <p className="eyebrow">MARKETPLACE · STAGE 1</p>
        <h1>Marketplace</h1>
        <p className="muted">
          Foundation for buyers and sellers on one account. Full catalogue, cart and checkout come in later stages.
        </p>
      </header>

      {error && <div className="auth-alert error">{error}</div>}
      {loading && <p className="muted">Loading…</p>}

      <div className="market-roles">
        <article className="market-card">
          <ShoppingBag size={22} />
          <h3>Buyer</h3>
          <p className="muted">Every signed-in user can browse and purchase when commerce features ship.</p>
        </article>
        <article className="market-card">
          <Store size={22} />
          <h3>Seller</h3>
          <p className="muted">
            {seller
              ? `Shop “${seller.shop_name}” · status ${seller.status}`
              : 'Create a seller profile to list products later.'}
          </p>
          {!seller && (
            <div className="market-form">
              <input
                placeholder="Shop name"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
              />
              <button
                type="button"
                className="auth-primary"
                onClick={() =>
                  void upsertSellerProfile({ shop_name: shopName })
                    .then((s) => setSeller(s))
                    .catch((e: Error) => setError(e.message))
                }
              >
                Create seller profile
              </button>
            </div>
          )}
        </article>
      </div>

      <h2>Categories</h2>
      <div className="market-chips">
        {categories.map((c) => (
          <span key={c.id} className="market-chip">
            {c.title}
          </span>
        ))}
        {categories.length === 0 && <p className="muted">Apply migration 0011 to seed categories.</p>}
      </div>

      <h2>Active products</h2>
      <div className="market-grid">
        {products.map((p) => (
          <article key={p.id} className="market-card">
            <h3>{p.title}</h3>
            <p className="muted">
              {(p.price_cents / 100).toFixed(2)} {p.currency}
            </p>
          </article>
        ))}
        {products.length === 0 && (
          <p className="muted">No active products yet — listing UI arrives in Stage 2+.</p>
        )}
      </div>
    </section>
  );
}
