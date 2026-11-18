const express = require('express');
const { getMusicUnlocks } = require('../services/musicUnlockService');

const router = express.Router();

// GET /api/music/unlocks -> { unlocked: [trackId], songs: [{ trackId, hint, goal, progress, unlocked }] }
router.get('/unlocks', async (req, res) => {
  try {
    res.json(await getMusicUnlocks());
  } catch (err) {
    console.error('GET /api/music/unlocks', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
