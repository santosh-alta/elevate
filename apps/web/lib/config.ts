export const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");
export const API_BASE = `${API_URL}/v1`;
export const TOKEN_COOKIE = "elevate_token";
