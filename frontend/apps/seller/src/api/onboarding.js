import api from '../api.js'

function toList(data, key) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data[key])) return data[key]
  return []
}

export async function trackFunnelEvent(step) {
  try {
    await api.post('/v1/onboarding/funnel-event', { step })
    return true
  } catch (_) {
    return false
  }
}

export async function goLiveShop(shopId) {
  const res = await api.post(`/v1/shops/${shopId}/go-live`)
  return res.data
}

export async function fetchMyShop() {
  const res = await api.get('/shops?mine=true')
  return toList(res.data, 'shops')[0] || null
}

export async function saveShopProfile(shopId, profile) {
  const payload = {
    name: profile.name,
    address: profile.address,
    lat: profile.lat,
    lng: profile.lng,
    open_time: profile.open_time,
    close_time: profile.close_time,
    category: profile.category,
  }
  if (shopId) {
    const res = await api.put(`/shops/${shopId}`, payload)
    return res.data
  } else {
    const res = await api.post('/shops', payload)
    return res.data
  }
}

export async function getProductCount(shopId) {
  const res = await api.get('/products', { params: { shop_id: shopId } })
  return toList(res.data, 'products').length
}

export async function createProduct(payload) {
  const res = await api.post('/products', payload)
  return res.data
}

export async function deleteProduct(productId) {
  await api.delete(`/products/${productId}`)
}

export async function fetchRecentOrders(shopId) {
  const res = await api.get('/orders')
  const all = toList(res.data, 'orders')
  return all
    .filter((o) => o.shop_id === shopId || o.shop?.id === shopId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export async function checkTestOrderDetected(shopId, sinceMs = 30 * 60 * 1000) {
  const orders = await fetchRecentOrders(shopId)
  const cutoff = Date.now() - sinceMs
  return orders.some(
    (o) => new Date(o.created_at).getTime() >= cutoff || o.status === 'placed'
  )
}
