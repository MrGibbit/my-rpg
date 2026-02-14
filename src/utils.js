// src/utils.js
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const dist  = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const now   = () => performance.now();
