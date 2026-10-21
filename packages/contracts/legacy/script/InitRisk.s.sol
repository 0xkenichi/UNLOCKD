// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ValuationEngine.sol";

contract InitRisk is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        
        // Load addresses from .env if available, or use recently deployed ones
        address valEngineAddr = vm.envAddress("VALUATION_ENGINE_ADDRESS");
        ValuationEngine valEngine = ValuationEngine(valEngineAddr);

        vm.startBroadcast(deployerKey);

        // V8.0 Citadel: Master Risk Initialization
        
        // 1. Core Economics
        valEngine.setRiskFreeRate(5);     // 5% Risk Free Rate
        valEngine.setVolatility(50);     // 50% Volatility baseline
        valEngine.setMaxPriceAge(1 hours);
        valEngine.setTwapInterval(1 hours);
        valEngine.setMaxTwapLookback(20);

        // 2. Oracle Protection
        valEngine.setDeviationThresholdBps(1000); // 10% max deviation between feeds
        valEngine.setEWMAAlpha(2000);             // 20% alpha for EWMA smoothing

        // 3. Drawdown Penalties
        valEngine.setDrawdownParams(50, 2000);    // 0.5% extra discount per 1% drawdown, capped at 20%
        valEngine.setRangeVolWeight(10);          // Range impact on volatility

        // 4. Global Ceilings
        valEngine.setGlobalMaxOmega(10000);       // 100% max omega multiplier

        vm.stopBroadcast();

        console.log("Risk parameters initialized for ValuationEngine at:", valEngineAddr);
    }
}
