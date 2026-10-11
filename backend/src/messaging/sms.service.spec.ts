import { SmsService } from './sms.service';

const make = (env: Record<string, string>) => {
  const prisma = { smsLog: { create: jest.fn().mockResolvedValue({}) } };
  const svc = new SmsService({ get: (k: string) => env[k] } as never, prisma as never);
  return { svc, prisma };
};

describe('SmsService with Beem', () => {
  const env = { SMS_PROVIDER: 'beem', BEEM_API_KEY: 'k', BEEM_SECRET_KEY: 's', BEEM_SENDER_ID: 'MAYODE' };
  afterEach(() => jest.restoreAllMocks());

  it('posts to /v1/send with Basic auth and digits-only recipient', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, text: async () => '' } as Response);
    const { svc, prisma } = make(env);
    expect(await svc.sendTransactional('0768680433', 'hello', 'otp', 'hidden')).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://apisms.beem.africa/v1/send');
    expect((init.headers as any).Authorization).toBe(`Basic ${Buffer.from('k:s').toString('base64')}`);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ source_addr: 'MAYODE', message: 'hello', recipients: [{ dest_addr: '255768680433' }] });
    expect(prisma.smsLog.create.mock.calls[0][0].data).toMatchObject({ message: 'hidden', status: 'sent' });
  });

  it('reports failure when Beem rejects or the network fails', async () => {
    const { svc } = make(env);
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'no' } as Response);
    expect(await svc.sendTransactional('0768680433', 'x')).toBe(false);
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('down'));
    expect(await svc.sendTransactional('0768680433', 'x')).toBe(false);
  });

  it('simulates (and accepts) when keys are missing', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const { svc } = make({ SMS_PROVIDER: 'beem' });
    expect(await svc.sendTransactional('0768680433', 'x')).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
