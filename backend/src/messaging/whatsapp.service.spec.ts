import { cleanTemplateParam, WhatsappService } from './whatsapp.service';

describe('WhatsappService', () => {
  it('cleans template parameters', () => {
    expect(cleanTemplateParam('a\nb\t c      d')).toBe('a b  c   d');
    expect(cleanTemplateParam('x'.repeat(2000)).length).toBe(900);
  });

  it('records a simulated message when no credentials are set', async () => {
    const created: any[] = [];
    const prisma: any = { smsLog: { create: jest.fn(async ({ data }) => created.push(data)) } };
    const svc = new WhatsappService({ get: () => undefined } as any, prisma);
    expect(svc.isConfigured()).toBe(false);
    const r = await svc.sendTemplate('0700000001', 'weather_alert', 'sw', ['Title', 'Body'], 'whatsapp_weather');
    expect(r).toEqual({ ok: true, status: 'simulated' });
    expect(created[0]).toMatchObject({ phone: '+255700000001', type: 'whatsapp_weather', status: 'simulated' });
  });

  it('posts a template message to the Cloud API and reports failures', async () => {
    const prisma: any = { smsLog: { create: jest.fn() } };
    const cfg: Record<string, string> = { WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '123' };
    const svc = new WhatsappService({ get: (k: string) => cfg[k] } as any, prisma);
    const spy = jest.spyOn(global, 'fetch' as any).mockResolvedValueOnce({ ok: true } as any).mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'bad' } as any);
    expect(await svc.sendTemplate('+255700000001', 'weather_alert', 'en', ['T', 'M'])).toEqual({ ok: true, status: 'sent' });
    const [url, init] = spy.mock.calls[0] as [string, any];
    expect(url).toContain('/123/messages');
    const body = JSON.parse(init.body);
    expect(body.to).toBe('255700000001');
    expect(body.template).toMatchObject({ name: 'weather_alert', language: { code: 'en' } });
    expect(body.template.components[0].parameters).toHaveLength(2);
    expect((await svc.sendTemplate('+255700000001', 'weather_alert', 'en', ['T', 'M'])).status).toBe('failed');
    spy.mockRestore();
  });
});
