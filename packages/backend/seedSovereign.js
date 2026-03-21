// Seed Sovereign Tokenomics for Vestra / ASI
require('dotenv').config();
const persistence = require('./persistence');

async function seed() {
    await persistence.init();

    console.log('[seed] Seeding Sovereign Tokenomics...');

    // 1. $CRDT (Sovereign ASI Credit)
    await persistence.saveTokenProject({
        id: 'crdt-asi',
        name: 'Sovereign ASI Credit',
        symbol: '$CRDT',
        description: 'Native agentic credit asset for the ASI Chain ecosystem.',
        category: 'Agentic Finance',
        metadata: {
            fundraising: {
                token_price: '$1.00',
                valuation: '$1.24B'
            }
        }
    });

    await persistence.saveTokenUnlockEvent({
        id: 'crdt-unlock-1',
        tokenId: 'crdt-asi',
        eventType: 'TGE',
        occurrenceDate: '2026-06-01',
        amount: '100,000,000',
        percentage: 10,
        metadata: { info: 'Initial Agent Distribution' }
    });

    await persistence.saveTokenUnlockEvent({
        id: 'crdt-unlock-2',
        tokenId: 'crdt-asi',
        eventType: 'Cliff End',
        occurrenceDate: '2026-12-01',
        amount: '250,000,000',
        percentage: 25,
        metadata: { info: 'Vestra Protocol Liquidity Provision' }
    });

    // 2. VEST (Vestra Protocol Token)
    await persistence.saveTokenProject({
        id: 'vestra-dao',
        name: 'Vestra Token',
        symbol: 'VEST',
        description: 'Governance and utility token for the Vestra Protocol.',
        category: 'DeFi Infrastructure',
        metadata: {
            fundraising: {
                token_price: '$0.42',
                valuation: '$420M'
            }
        }
    });

    await persistence.saveTokenUnlockEvent({
        id: 'vest-unlock-1',
        tokenId: 'vestra-dao',
        eventType: 'Ecosystem Phase 1',
        occurrenceDate: '2026-04-15',
        amount: '5,000,000',
        percentage: 5,
        metadata: { info: 'Incentivized Testnet Rewards' }
    });

    console.log('[seed] Seeding complete.');
    process.exit(0);
}

seed().catch(err => {
    console.error(err);
    process.exit(1);
});
