import express from "express";
import fetch from "node-fetch";
import NodeCache from "node-cache";

const app = express();
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // cache 5 minutes

const ROLIMONS_BASE = "https://api.rolimons.com";

app.get("/", (req, res) => res.send("Rolimons proxy running"));

app.get("/api/player/:userid", async (req, res) => {
  const userId = String(req.params.userid).replace(/\\D/g, "");
  if (!userId) return res.status(400).json({ success: false, error: "invalid user id" });

  const cacheKey = `player:${userId}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  const endpoint = `${ROLIMONS_BASE}/players/v1/playerassets/${userId}`;

  try {
    const r = await fetch(endpoint, { method: "GET" });
    if (!r.ok) {
      return res.status(502).json({ success: false, error: "upstream error", status: r.status });
    }
    const data = await r.json();

    const out = {
      success: true,
      playerId: data.playerId ?? Number(userId),
      value: data.value ?? data.playerValue ?? null,
      rap: data.rap ?? null,
      playerAssets: data.playerAssets ?? data.assets ?? [],
    };

    cache.set(cacheKey, out, 300);
    return res.json({ ...out, cached: false });
  } catch (err) {
    console.error("proxy error", err);
    return res.status(500).json({ success: false, error: "internal error" });
  }
});

app.post("/api/clearCache", (req, res) => { cache.flushAll(); res.json({ ok: true }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
