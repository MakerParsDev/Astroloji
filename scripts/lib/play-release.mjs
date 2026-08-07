function maxVersionCode(release) {
  let max = -1n;
  for (const value of release?.versionCodes ?? []) {
    if (!/^\d+$/.test(String(value))) continue;
    const parsed = BigInt(String(value));
    if (parsed > max) max = parsed;
  }
  return max;
}

function highestVersion(releases) {
  return [...releases].sort((a, b) => {
    const av = maxVersionCode(a);
    const bv = maxVersionCode(b);
    if (av === bv) return JSON.stringify(a).localeCompare(JSON.stringify(b));
    return av > bv ? -1 : 1;
  })[0] ?? null;
}

export function selectRelevantRelease(track) {
  const releases = [...(track?.releases ?? [])];
  const staged = releases.filter((release) => ['inProgress', 'halted'].includes(release.status));
  if (staged.length) return highestVersion(staged);
  const completed = releases.filter((release) => release.status === 'completed');
  return completed.length ? highestVersion(completed) : null;
}

export function releaseRolloutFraction(track) {
  const release = selectRelevantRelease(track);
  if (!release) return null;
  if (release.userFraction !== null && release.userFraction !== undefined) {
    const fraction = Number(release.userFraction);
    return Number.isFinite(fraction) ? fraction : null;
  }
  return release.status === 'completed' ? 1 : null;
}
