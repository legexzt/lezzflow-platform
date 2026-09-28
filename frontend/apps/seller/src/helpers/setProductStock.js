/**
 * setProductStock — shared helper for stock toggle (Items 4 & 5).
 * Uses the existing lf_stock_<id> localStorage cache format from Products.jsx.
 * NOTE: Products.jsx uses `lf_stock_${id}` (plain string). The spec says
 * `lezzflow.prevStock.<productId>` but the existing code uses `lf_stock_${id}`.
 * This helper wraps the existing convention so there is exactly ONE cache format.
 * Do NOT create a separate cache key anywhere else.
 *
 * @param {object} product  - full product object from the API
 * @param {boolean} inStock - true = restore, false = mark out
 * @returns {Promise<{product: object}>} updated product
 */
import api from '../api.js'

const CACHE_PREFIX = 'lf_stock_'

export function savePrevStock(productId, qty) {
  try { localStorage.setItem(`${CACHE_PREFIX}${productId}`, String(qty)) } catch (_) {}
}

export function readPrevStock(productId) {
  try {
    const v = localStorage.getItem(`${CACHE_PREFIX}${productId}`)
    const n = parseInt(v, 10)
    return isNaN(n) || n <= 0 ? null : n
  } catch { return null }
}

export function clearPrevStock(productId) {
  try { localStorage.removeItem(`${CACHE_PREFIX}${productId}`) } catch (_) {}
}

/**
 * Mark a product out-of-stock (inStock=false) or restore (inStock=true).
 * Returns the updated product object on success.
 * On mark-out: saves previous qty to localStorage before API call.
 * On restore: reads previous qty from localStorage, falls back to null if missing.
 * If no previous qty available on restore, returns null so caller can disable Restore.
 */
export async function setProductStock(product, inStock) {
  if (inStock) {
    // Restore
    const prevQty = readPrevStock(product.id)
    if (prevQty === null) {
      // No cached quantity — cannot restore safely; caller must handle
      return null
    }
    await api.put(`/products/${product.id}`, { stock: prevQty })
    clearPrevStock(product.id)
    return { ...product, stock: prevQty }
  } else {
    // Mark out of stock — save current qty first
    const qty = Number(product.stock) || 0
    if (qty > 0) savePrevStock(product.id, qty)
    await api.put(`/products/${product.id}`, { stock: 0 })
    return { ...product, stock: 0 }
  }
}
