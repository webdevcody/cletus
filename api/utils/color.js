// Color generation utilities for job identification

/**
 * Generate a high contrast hex color suitable for dark backgrounds
 * @returns {string} Hex color string
 */
export const generateHighContrastHex = () => {
  // High saturation and medium-high lightness for dark backgrounds
  const hue = Math.floor(Math.random() * 360);
  const saturation = 95; // 0-100
  const lightness = 70; // 0-100
  return hslToHex(hue, saturation, lightness);
};

/**
 * Convert HSL color values to hex format
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {string} Hex color string
 */
export const hslToHex = (h, s, l) => {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const r = Math.round(255 * f(0));
  const g = Math.round(255 * f(8));
  const b = Math.round(255 * f(4));
  const toHex = (x) => x.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

/**
 * Generate a deterministic color based on a string input
 * Useful for consistent colors across sessions
 * @param {string} input - Input string to generate color from
 * @returns {string} Hex color string
 */
export const generateDeterministicColor = (input) => {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const hue = Math.abs(hash % 360);
  const saturation = 95;
  const lightness = 70;
  return hslToHex(hue, saturation, lightness);
};