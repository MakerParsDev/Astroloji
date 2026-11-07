import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const LOCALES = [
  { folder: 'values', scoped: 'This action', dialog: 'by this action', help: 'Privacy Policy' },
  { folder: 'values-tr', scoped: 'Bu işlem', dialog: 'Bu işlem', help: 'Gizlilik Politikası' },
  { folder: 'values-de', scoped: 'Dieser Vorgang', dialog: 'Durch diese Aktion', help: 'Datenschutzerklärung' },
  { folder: 'values-es', scoped: 'Esta acción', dialog: 'con esta acción', help: 'Política de privacidad' },
  { folder: 'values-fr', scoped: 'Cette action', dialog: 'par cette action', help: 'Politique de confidentialité' },
  { folder: 'values-pt', scoped: 'Esta ação', dialog: 'por esta ação', help: 'Política de Privacidade' }
] as const;

function getString(xml: string, key: string): string {
  const value = xml.match(new RegExp('<string name="' + key + '">([^<]*)</string>'))?.[1];
  if (!value) throw new Error('Missing localized resource: ' + key);
  return value;
}

describe('mood-history deletion privacy disclosure contract', () => {
  for (const locale of LOCALES) {
    it('limits Firebase Analytics erasure to the actual action in ' + locale.folder, () => {
      const xml = readFileSync(
        resolve(process.cwd(), '../Astroloji/app/src/main/res/' + locale.folder + '/strings.xml'),
        'utf8'
      );
      const description = getString(xml, 'settings_mood_delete_description');
      const confirmation = getString(xml, 'settings_mood_delete_dialog_body');

      expect(description).toContain(locale.scoped);
      expect(description).toContain(locale.help);
      expect(confirmation).toContain(locale.dialog);
      expect(description).toMatch(/Firebase[- ]Analytics/);
      expect(confirmation).toMatch(/Firebase[- ]Analytics/);
      // Historical GA4 user-level erasure requires a separately verified
      // identifier/provider request; this self-service action does not do it.
      expect(description).not.toMatch(/cannot erase|silinemez/);
    });
  }
});
