const express = require('express');
const router = express.Router();
const SovereignDataService = require('../lib/SovereignDataService');
const persistence = require('../persistence');

/**
 * @route POST /api/faucet/warp
 * @desc Fast-forward simulated time for the user
 */
router.post('/warp', async (req, res) => {
    const { seconds } = req.body;
    if (typeof seconds !== 'number') {
        return res.status(400).json({ ok: false, error: 'Invalid warp duration' });
    }

    SovereignDataService.setTimeOffset(seconds);
    
    return res.json({ 
        ok: true, 
        currentOffset: seconds,
        simulatedTimestamp: SovereignDataService.getSimulatedTimestamp() 
    });
});

/**
 * @route POST /api/faucet/generate-vesting
 * @desc Generate a mock vesting position for testing
 */
router.post('/generate-vesting', async (req, res) => {
    const { wallet, symbol, amount } = req.body;
    if (!wallet || !symbol || !amount) {
        return res.status(400).json({ ok: false, error: 'Missing parameters' });
    }

    try {
        const mock = await SovereignDataService.generateMockVesting(wallet, symbol, amount);
        return res.json({ ok: true, data: mock });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/associate-name', async (req, res) => {
    const { contractAddress, name } = req.body;
    if (!contractAddress || !name) {
        return res.status(400).json({ ok: false, error: 'Missing parameters' });
    }

    try {
        const success = await persistence.associateVestingName(contractAddress, name);
        return res.json({ ok: success });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
