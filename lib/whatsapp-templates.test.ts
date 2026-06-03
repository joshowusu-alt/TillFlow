import { describe, expect, it } from 'vitest';
import { applyTemplateVars, WHATSAPP_TEMPLATES } from './whatsapp-templates';

describe('whatsapp templates', () => {
  it('substitutes variables', () => {
    const tpl = WHATSAPP_TEMPLATES[0];
    const out = applyTemplateVars(tpl.body, { ownerName: 'Ama', businessName: 'Adom Shop' });
    expect(out).toContain('Ama');
    expect(out).toContain('Adom Shop');
    expect(out).not.toContain('{ownerName}');
  });
});
