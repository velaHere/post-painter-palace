/**
 * Mirrors the backend's OTP rules so the UI can show accurate timers/limits.
 * Keep in sync with OTPGenerator / OTPRepository on the server.
 */
export const OTP_LENGTH = 6; // String.format("%06d", …)
export const OTP_TTL_SECONDS = 5 * 60; // Redis key expires after 5 minutes
export const OTP_MAX_ATTEMPTS = 5; // reserve_attempt.lua: attempts >= 5 → blocked
export const OTP_RESEND_COOLDOWN_SECONDS = 30; // resend_rate_limit.lua cooldown
