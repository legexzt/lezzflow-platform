import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);
const STORAGE_KEY = 'lezzflow_mart_cart';

const EMPTY = { shopId: null, shopName: '', items: [] };

export function CartProvider({ children }) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.items)) return parsed;
      }
    } catch {
      // ignore corrupt storage
    }
    return EMPTY;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage unavailable — cart just won't persist
    }
  }, [state]);

  // One shop per order: adding from a different shop replaces the cart.
  const addItem = (product, shop) => {
    setState((prev) => {
      const sameShop = !prev.shopId || prev.shopId === shop?.id;
      const base = sameShop ? prev.items : [];
      const existing = base.find((i) => i.product.id === product.id);
      const items = existing
        ? base.map((i) =>
            i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
          )
        : [...base, { product, quantity: 1 }];
      return {
        shopId: shop?.id ?? prev.shopId,
        shopName: shop?.name ?? prev.shopName,
        items,
      };
    });
  };

  const setQuantity = (productId, quantity) => {
    setState((prev) => {
      const items =
        quantity <= 0
          ? prev.items.filter((i) => i.product.id !== productId)
          : prev.items.map((i) =>
              i.product.id === productId ? { ...i, quantity } : i
            );
      return items.length ? { ...prev, items } : EMPTY;
    });
  };

  const removeItem = (productId) => setQuantity(productId, 0);

  const clear = () => setState(EMPTY);

  const { count, total } = useMemo(
    () => ({
      count: state.items.reduce((n, i) => n + i.quantity, 0),
      total: state.items.reduce(
        (n, i) => n + (Number(i.product.price) || 0) * i.quantity,
        0
      ),
    }),
    [state.items]
  );

  const value = {
    items: state.items,
    shopId: state.shopId,
    shopName: state.shopName,
    count,
    total,
    addItem,
    setQuantity,
    removeItem,
    clear,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
