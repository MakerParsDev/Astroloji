import assert from 'node:assert/strict';

/** Guard multiline workflow run scripts against direct, untrusted dispatch input interpolation. */
export function assertNoDispatchInputsInRunBlocks(source, label) {
  let runIndent = null;
  for (const line of source.split(/\r?\n/)) {
    const indent = line.match(/^\s*/)[0].length;
    if (runIndent !== null && line.trim() && indent <= runIndent) runIndent = null;
    if (runIndent !== null) {
      assert.doesNotMatch(line, /\$\{\{\s*inputs\./, `${label}: ${line.trim()}`);
    }
    if (/^\s*run:\s*(?:\||>-?)?\s*$/.test(line)) runIndent = indent;
  }
}
