/**
 * Format a hit's short label based on event side.
 * Offense → 1B / 2B / 3B / HR
 * Defense → K  / OUT / DP / TP
 */
export function formatHit(type, side) {
  if (side === 'defense') {
    return { single: 'K', double: 'OUT', triple: 'DP', home_run: 'TP' }[type] || type;
  }
  return { single: '1B', double: '2B', triple: '3B', home_run: 'HR' }[type] || type;
}

/**
 * Full descriptive label.
 * Offense → "Single" / "Double" / "Triple" / "Home Run"
 * Defense → "Strike" / "Caught Out" / "Double Play" / "Triple Play"
 */
export function describeHit(type, side) {
  if (side === 'defense') {
    return { single: 'Strike', double: 'Caught Out', triple: 'Double Play', home_run: 'Triple Play' }[type] || type;
  }
  return { single: 'Single', double: 'Double', triple: 'Triple', home_run: 'Home Run' }[type] || type;
}
