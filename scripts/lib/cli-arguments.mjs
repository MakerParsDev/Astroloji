export function cliArgument(name, argv = process.argv.slice(2)) {
  const flag = `--${name}`;
  const equalsPrefix = `${flag}=`;
  const matches = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === flag) {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`${flag} requires a non-empty value.`);
      }
      matches.push(next);
      index += 1;
    } else if (token.startsWith(equalsPrefix)) {
      matches.push(token.slice(equalsPrefix.length));
    }
  }

  if (matches.length > 1) throw new Error(`${flag} may only be specified once.`);
  if (matches.length === 0) return undefined;
  if (!matches[0].trim()) throw new Error(`${flag} requires a non-empty value.`);
  return matches[0];
}
