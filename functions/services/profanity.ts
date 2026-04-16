// Profanity filter for chat messages and display names.
// Uses a blocklist with boundary-aware matching to catch whole words
// and common leetspeak substitutions.

const BLOCKED_WORDS = [
  'ass', 'asshole', 'bastard', 'bitch', 'bullshit', 'cock', 'crap',
  'cunt', 'damn', 'dick', 'douche', 'dumbass', 'fag', 'faggot',
  'fuck', 'goddamn', 'hell', 'jackass', 'jerk', 'nigger', 'nigga',
  'piss', 'pussy', 'retard', 'shit', 'slut', 'stfu', 'tits',
  'twat', 'whore', 'wanker', 'wtf',
];

// Leetspeak substitution map
const LEET_MAP: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's',
  '7': 't', '@': 'a', '$': 's', '!': 'i',
};

function normalizeLeet(text: string): string {
  return text.replace(/[013457@$!]/g, (ch) => LEET_MAP[ch] || ch);
}

// Build a regex that matches any blocked word at word boundaries
const pattern = new RegExp(
  '\\b(' + BLOCKED_WORDS.join('|') + ')\\b',
  'i'
);

/**
 * Returns true if the text contains profanity.
 */
export function containsProfanity(text: string): boolean {
  const normalized = normalizeLeet(text.toLowerCase());
  return pattern.test(normalized);
}

/**
 * Replaces profane words with asterisks.
 */
export function censorText(text: string): string {
  const normalized = normalizeLeet(text.toLowerCase());
  // Find matches in the normalized version and censor the same positions in the original
  let result = text;
  const globalPattern = new RegExp(
    '\\b(' + BLOCKED_WORDS.join('|') + ')\\b',
    'gi'
  );
  let match;
  // Work on normalized to find positions, apply to original
  const offsets: { start: number; end: number }[] = [];
  while ((match = globalPattern.exec(normalized)) !== null) {
    offsets.push({ start: match.index, end: match.index + match[0].length });
  }
  // Apply replacements from end to start to preserve positions
  for (let i = offsets.length - 1; i >= 0; i--) {
    const { start, end } = offsets[i];
    const stars = '*'.repeat(end - start);
    result = result.substring(0, start) + stars + result.substring(end);
  }
  return result;
}
