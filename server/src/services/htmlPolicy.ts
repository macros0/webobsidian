/** Only inert color declarations; whitespace is valid CSS, not a reason to lose color. */
export const COLOR_STYLE_RE = /^\s*(?:(?:color|background-color)\s*:\s*#(?:[\da-fA-F]{8}|[\da-fA-F]{6}|[\da-fA-F]{3})\s*;?\s*){1,2}$/i;
