/**
 * Feature flags for protocol integrations and rollout.
 * Set via env: VITE_FEATURE_SABLIER_IMPORT, VITE_FEATURE_FUNDRAISE_ONBOARD.
 * Defaults: true (enabled) so behaviour is unchanged when env is unset.
 */
const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

export const FEATURE_SABLIER_IMPORT =
  env.VITE_FEATURE_SABLIER_IMPORT !== 'false' && env.VITE_FEATURE_SABLIER_IMPORT !== '0';

export const FEATURE_FUNDRAISE_ONBOARD =
  env.VITE_FEATURE_FUNDRAISE_ONBOARD !== 'false' && env.VITE_FEATURE_FUNDRAISE_ONBOARD !== '0';
