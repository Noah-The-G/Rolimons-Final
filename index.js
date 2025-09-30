import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// Rolimons cache (for limited values)
let itemDetailsCache = null;
let lastItemDetailsFetch = 0;
const ITEM_DETAILS_URL = "https://www.rolimons.com/itemapi/itemdetails";
const ITEM_CACHE_TTL = 1000 * 60 * 10; // 10 minutes

// Hardcoded bundle values (Korblox, Headless, etc.)
const BUNDLE_VALUES = {
  "192": 17000, // Korblox Deathspeaker bundleId
  "240": 31000, // Headless Horseman bundleId
};

// ---- Helpers ----
async function getItemDetails() {
  const now = Date.now();
  if (!itemDetailsCache || now - lastItemDetailsFetch > ITEM_CACHE_TTL) {
    const res = await fetch(ITEM_DETAILS_URL);
    itemDetailsCache = await res.json();
    lastItemDetailsFetch = now;
  }
  return itemDetailsCache;
}

async function getPlayerCollectibles(userId) {
  const url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?sortOrder=Asc&limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Roblox API error ${res.status}`);
  return await res.json();
}

// Get bundles owned by a user
async function getPlayerBundles(userId) {
  const url = `https://avatar.roblox.com/v1/users/${userId}/outfits?page=1&itemsPerPage=50`;
  const res = await fetch(url);
  if (!res.ok) return { data: [] };
  return await res.json();
}

// Get accessories owned by a user (requires public inventory)
async function getPlayerAccessories(userId, assetTypeId = 8) {
  // assetTypeId = 8 = hats, you can loop other types if needed
  const url = `https://inventory.roblox.com/v1/users/${userId}/inventory/${assetTypeId}?limit=100&sortOrder=Asc`;
  const res = await fetch(url);
  if (!res.ok) return { data: [] };
  return await res.json();
}

// Get catalog price for specific assets (non-limiteds still on-sale)
async function getCatalogPrices(assetIds) {
  if (assetIds.length === 0) return {};
  const url = `https://catalog.roblox.com/v1/catalog/items/details`;
  const body = {
    items: assetIds.map((id) => ({ itemType: "Asset", id: Number(id) })),
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return {};
  const json = await res.json();
  const map = {};
  json.data.forEach((item) => {
    if (item.price) map[item.id] = item.price;
  });
  return map;
}

// ---- Route ----
app.get("/api/player/:id", async (req, res) => {
  const userId = req.params.id;
  try {
    const [collectibles, itemDetails] = await Promise.all([
      getPlayerCollectibles(userId),
      getItemDetails(),
    ]);

    let totalValue = 0;
    let totalRap = 0;
    const itemBreakdown = [];

    // Limiteds (via Rolimons)
    if (collectibles && collectibles.data) {
      for (const item of collectibles.data) {
        const itemId = String(item.assetId);
        const rap = item.recentAveragePrice || 0;
        const rolData = itemDetails.items[itemId];
        const value = rolData ? rolData[4] : 0;

        totalRap += rap;
        totalValue += value || rap;

        itemBreakdown.push({
          name: item.name,
          id: itemId,
          type: "Limited",
          rap,
          value: value || rap,
        });
      }
    }

    // Bundles (hardcoded special values)
    const bundles = await getPlayerBundles(userId);
    if (bundles && bundles.data) {
      for (const bundle of bundles.data) {
        const bundleId = String(bundle.id);
        if (BUNDLE_VALUES[bundleId]) {
          totalValue += BUNDLE_VALUES[bundleId];
          itemBreakdown.push({
            name: bundle.name,
            id: bundleId,
            type: "Bundle",
            value: BUNDLE_VALUES[bundleId],
          });
        }
      }
    }

    // Accessories (non-limited on-sale)
    const accessories = await getPlayerAccessories(userId, 8); // hats as example
    if (accessories && accessories.data) {
      const assetIds = accessories.data.map((a) => a.assetId);
      const prices = await getCatalogPrices(assetIds);
      for (const asset of accessories.data) {
        const price = prices[asset.assetId];
        if (price) {
          totalValue += price;
          itemBreakdown.push({
            name: asset.name,
            id: asset.assetId,
            type: "Accessory",
            value: price,
          });
        }
      }
    }

    res.json({
      success: true,
      playerId: userId,
      value: totalValue,
      rap: totalRap,
      items: itemBreakdown,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy running on port ${PORT}`);
});

