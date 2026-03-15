use anchor_lang::prelude::*;

declare_id!("Vest111111111111111111111111111111111111111");

#[program]
pub mod vesting_oracle {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, committee: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.committee = committee;
        config.admin = ctx.accounts.admin.key();
        config.is_active = true;
        msg!("Vestra Vesting Oracle Initialized with committee: {}", committee);
        Ok(())
    }

    pub fn update_dpv(
        ctx: Context<UpdateDpv>,
        token_mint: Pubkey,
        raw_quantity: u64,
        unlock_time: i64,
        spot_price: u64, // scaled by 1e6
        volatility_bps: u32,
        risk_free_rate_bps: u32,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(config.is_active, VestraError::InactiveOracle);
        
        let now = Clock::get()?.unix_timestamp;
        let time_to_unlock = (unlock_time - now).max(0);
        
        // Simplified DPV Calculation:
        // DPV = Spot * exp(-r * T) * (1 - sigma * sqrt(T))
        // For on-chain simplicity, we'll use linear approximations or pre-computed factors
        // in this beta version. Full Black-Scholes will be added for Mainnet.
        
        let t_years_scaled = (time_to_unlock as f64) / (365.0 * 24.0 * 3600.0);
        let discount_rate = (risk_free_rate_bps as f64) / 10000.0;
        let time_discount = 1.0 - (discount_rate * t_years_scaled);
        
        let vol = (volatility_bps as f64) / 10000.0;
        let vol_discount = 1.0 - (vol * t_years_scaled.sqrt());
        
        let dpv_per_token = (spot_price as f64) * time_discount * vol_discount;
        let total_dpv = (raw_quantity as f64) * dpv_per_token;

        msg!("DPV Calculated: {} for token {}", total_dpv, token_mint);
        
        // Emit event for backend consumption
        emit!(DpvUpdated {
            token_mint,
            dpv: total_dpv as u64,
            timestamp: now,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 32 + 1,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateDpv<'info> {
    pub committee_member: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump,
        constraint = config.committee == committee_member.key() @ VestraError::UnauthorizedCommittee
    )]
    pub config: Account<'info, Config>,
}

#[account]
pub struct Config {
    pub committee: Pubkey,
    pub admin: Pubkey,
    pub is_active: bool,
}

#[event]
pub struct DpvUpdated {
    pub token_mint: Pubkey,
    pub dpv: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum VestraError {
    #[msg("Oracle is currently inactive")]
    InactiveOracle,
    #[msg("Unauthorized committee member")]
    UnauthorizedCommittee,
}
