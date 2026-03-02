import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';

const pulseGlow = keyframes`
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.2); }
  100% { opacity: 1; transform: scale(1); }
`;

const lightSweep = keyframes`
  0% { left: -100%; }
  30% { left: 150%; }
  100% { left: 150%; }
`;

const entry = keyframes`
  from { opacity: 0; transform: translateY(20px); filter: blur(10px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
`;

const marquee = keyframes`
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
`;

const MonolithContainer = styled.div`
  position: relative;
  width: 100%;
  max-width: 1200px;
  background: var(--obsidian-surface, #0a0a0c);
  padding: 2px;
  border-radius: 4px;
  box-shadow: 
    0 50px 100px -20px rgba(0,0,0,0.5),
    0 30px 60px -30px rgba(0,0,0,0.6),
    inset 0 1px 1px rgba(255, 255, 255, 0.08); /* etch-highlight */
  overflow: hidden;
  animation: ${entry} 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  margin: 0 auto;
  font-family: 'Inter', sans-serif;
`;

const MonolithInner = styled.div`
  background: linear-gradient(135deg, #0d0d0f 0%, #050506 100%);
  padding: 30px 0;
  position: relative;
  border: 1px solid rgba(255,255,255,0.03);
  display: flex;
  flex-direction: column;
  gap: 16px;

  &::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.02) 1px, transparent 0);
    background-size: 24px 24px;
    pointer-events: none;
  }
`;

const Sheen = styled.div`
  position: absolute;
  top: 0; left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(
    to right,
    transparent,
    rgba(255,255,255,0.03),
    transparent
  );
  transform: skewX(-25deg);
  animation: ${lightSweep} 8s infinite;
  pointer-events: none;
`;

const HeaderStrip = styled.header`
  padding: 0 40px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  z-index: 2;
  
  @media (max-width: 768px) {
    padding: 0 20px;
  }
`;

const Label = styled.div`
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4em;
  color: #666666;
  font-weight: 900;
`;

const LiveIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: #00ff8c;
  text-shadow: 0 0 10px rgba(0, 255, 140, 0.3);
`;

const Pulse = styled.div`
  width: 6px;
  height: 6px;
  background: #00ff8c;
  border-radius: 50%;
  animation: ${pulseGlow} 1.5s infinite;
`;

const TickerWindow = styled.div`
  height: 120px;
  overflow: hidden;
  position: relative;
  border-top: 1px solid rgba(0, 0, 0, 0.8);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0,0,0,0.2);
`;

const TickerTrack = styled.div`
  display: flex;
  white-space: nowrap;
  width: max-content;
  height: 100%;
  animation: ${marquee} 25s linear infinite;

  &:hover {
    animation-play-state: paused;
  }
`;

const StockItem = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 50px;
  height: 100%;
  border-right: 1px solid rgba(255,255,255,0.03);
  position: relative;
  transition: background 0.3s ease;
  cursor: crosshair;

  &::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; width: 100%; height: 2px;
    background: transparent;
    transition: background 0.3s ease;
  }

  &:hover {
    background: rgba(255,255,255,0.01);
  }

  &:hover::after {
    background: #00ff8c;
  }
  
  @media (max-width: 768px) {
    padding: 0 30px;
  }
`;

const Symbol = styled.span`
  font-size: 28px;
  font-weight: 900;
  color: #e0e0e0;
  letter-spacing: -0.02em;
  margin-bottom: 4px;
`;

const DataRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-family: var(--font-mono);
`;

const Price = styled.span`
  font-size: 16px;
  color: ${props => props.color || '#e0e0e0'};
  transition: color 0.2s ease;
`;

const Change = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: ${props => props.isUp ? '#00ff8c' : '#ff3e3e'};
`;

const BestLTV = styled.div`
  font-size: 11px;
  color: #8b5cf6;
  font-weight: 600;
  margin-top: 4px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
`;

// Contract Data
const baseData = [
    { symbol: 'ARB', basePrice: 1.15, ltv: '45% DPV', isUp: true },
    { symbol: 'OP', basePrice: 2.40, ltv: '42% DPV', isUp: false },
    { symbol: 'TIA', basePrice: 12.50, ltv: '38% DPV', isUp: false },
    { symbol: 'PYTH', basePrice: 0.65, ltv: '48% DPV', isUp: true },
    { symbol: 'JUP', basePrice: 0.92, ltv: '50% DPV', isUp: true },
    { symbol: 'STRK', basePrice: 1.41, ltv: '40% DPV', isUp: true }
];

export default function MarketTicker() {
    const [timeStr, setTimeStr] = useState('');
    const [assets, setAssets] = useState(baseData.map(a => ({ ...a, currentPrice: a.basePrice, color: '' })));

    // Update clock
    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            setTimeStr(now.toISOString().split('T')[1].split('.')[0] + ' UTC');
        };
        const interval = setInterval(updateClock, 1000);
        updateClock();
        return () => clearInterval(interval);
    }, []);

    // Fluctuations
    useEffect(() => {
        const interval = setInterval(() => {
            setAssets(prev => {
                const next = [...prev];
                const idx = Math.floor(Math.random() * next.length);
                const asset = next[idx];

                const change = (Math.random() - 0.5) * 0.05;
                asset.currentPrice = asset.currentPrice + change;
                asset.color = change > 0 ? '#00ff8c' : '#ff3e3e';

                return next;
            });

            // reset color after 500ms
            setTimeout(() => {
                setAssets(prev => {
                    const next = [...prev];
                    next.forEach(a => a.color = '');
                    return next;
                });
            }, 500);
        }, 800);

        return () => clearInterval(interval);
    }, []);

    return (
        <MonolithContainer>
            <MonolithInner>
                <Sheen />

                <HeaderStrip>
                    <Label>Vestra Core // Vested Market Terminal</Label>
                    <LiveIndicator>
                        <Pulse />
                        <span>DPV_SYNC_ACTIVE</span>
                    </LiveIndicator>
                </HeaderStrip>

                <TickerWindow>
                    <TickerTrack>
                        {/* Original Set */}
                        {assets.map((asset, i) => (
                            <StockItem key={i}>
                                <Symbol>{asset.symbol}</Symbol>
                                <DataRow>
                                    <Price color={asset.color}>${asset.currentPrice.toFixed(2)}</Price>
                                    <Change isUp={asset.isUp}>{asset.isUp ? '+' : ''}{(asset.isUp ? 2.4 : -1.2)}%</Change>
                                </DataRow>
                                <BestLTV>MAX LOAN: {asset.ltv}</BestLTV>
                            </StockItem>
                        ))}
                        {/* Cloned Set For Marquee */}
                        {assets.map((asset, i) => (
                            <StockItem key={`clone-${i}`}>
                                <Symbol>{asset.symbol}</Symbol>
                                <DataRow>
                                    <Price color={asset.color}>${asset.currentPrice.toFixed(2)}</Price>
                                    <Change isUp={asset.isUp}>{asset.isUp ? '+' : ''}{(asset.isUp ? 2.4 : -1.2)}%</Change>
                                </DataRow>
                                <BestLTV>MAX LOAN: {asset.ltv}</BestLTV>
                            </StockItem>
                        ))}
                        {/* Cloned Set For Marquee Extra Safety */}
                        {assets.map((asset, i) => (
                            <StockItem key={`clone2-${i}`}>
                                <Symbol>{asset.symbol}</Symbol>
                                <DataRow>
                                    <Price color={asset.color}>${asset.currentPrice.toFixed(2)}</Price>
                                    <Change isUp={asset.isUp}>{asset.isUp ? '+' : ''}{(asset.isUp ? 2.4 : -1.2)}%</Change>
                                </DataRow>
                                <BestLTV>MAX LOAN: {asset.ltv}</BestLTV>
                            </StockItem>
                        ))}
                    </TickerTrack>
                </TickerWindow>

                <HeaderStrip as="footer">
                    <Label style={{ opacity: 0.5 }}>0.0012s Latency</Label>
                    <Label style={{ fontFamily: 'var(--font-mono)' }}>{timeStr}</Label>
                </HeaderStrip>
            </MonolithInner>
        </MonolithContainer>
    );
}
