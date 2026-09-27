/**
 * Lookup barcode details via OpenFoodFacts API v2
 * @param {string} code Barcode string
 * @returns {Promise<{found: boolean, name?: string, brands?: string, image?: string}>}
 */
async function lookupBarcode(code) {
  if (!code || typeof code !== 'string' || !code.trim()) {
    throw new Error('Barcode is required');
  }

  const cleanCode = code.trim();
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cleanCode)}.json`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'LezzFlowPlatform - Node.js API - Version 1.0',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return { found: false };
      }
      return { found: false };
    }

    const data = await res.json();

    if (data.status === 1 && data.product) {
      const product = data.product;
      const name = product.product_name || product.product_name_en || '';
      const brands = product.brands || '';
      const image = product.image_url || product.image_front_url || product.image_front_small_url || '';

      return {
        found: true,
        name,
        brands,
        image,
      };
    }

    return { found: false };
  } catch (err) {
    console.error(`Error querying OpenFoodFacts for code ${cleanCode}:`, err.message);
    return { found: false };
  }
}

module.exports = {
  lookupBarcode,
};
