import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// Cache Rolimons item details to avoid hammering their API
let itemDetailsCache = null;
let lastItemDetailsFetch = 0;
const ITEM_DETAILS_URL = "https://www.rolimons.com/itemapi/itemdetails";
const ITEM_CACHE_TTL = 1000 * 60 * 10; // 10 minutes

async function getItemDetails() {
  const now = Date.now();
  if (!itemDetailsCache || now - lastItemDetailsFetch > ITEM_CACHE_TTL) {
    const res = await fetch(ITEM_DETAILS_URL);
    itemDetailsCache = await res.json();
    lastItemDetailsFetch = now;
  }
  return itemDetailsCache;
}

// Fetch player assets from Roblox API
async function getPlayerAssets(userId) {
  const url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?sortOrder=Asc&limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Roblox API error ${res.status}`);
  return await res.json();
}

// Route: /api/player/:id
app.get("/api/player/:id", async (req, res) => {
  const userId = req.params.id;
  try {
    const [assets, itemDetails] = await Promise.all([
      getPlayerAssets(userId),
      getItemDetails()
    ]);

    let totalValue = 0;
    let totalRap = 0;

    if (assets && assets.data) {
      for (const item of assets.data) {
        const itemId = String(item.assetId);
        const rap = item.recentAveragePrice || 0;

        // Lookup Rolimon’s value if available
        const rolData = itemDetails.items[itemId];
        const value = rolData ? rolData[4] : 0; // index 4 = value in Rolimon’s API

        totalRap += rap;
        totalValue += value || rap; // fallback to RAP if no value exists
      }
    }

    res.json({
      success: true,
      playerId: userId,
      value: totalValue,
      rap: totalRap,
      cached: false
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy running on port ${PORT}`);
});

