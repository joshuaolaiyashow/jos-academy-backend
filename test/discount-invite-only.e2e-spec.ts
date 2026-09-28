import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import { DiscountAppliesTo, UserRole } from '../src/generated/prisma/client';
import { PaymentService } from '../src/payment/payment.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  authHeader as auth,
  createE2eApp,
  seedUser,
  type SeededUser,
} from './e2e-helpers';

const fakePaystack: Pick<
  PaymentService,
  'initializePayment' | 'verifyPayment'
> = {
  initializePayment: async ({ reference }) =>
    ({
      authorization_url: `https://paystack.test/${reference}`,
      access_code: 'access-code',
      reference: reference ?? 'unknown',
    }) as Awaited<ReturnType<PaymentService['initializePayment']>>,
  verifyPayment: async (reference) =>
    ({
      status: 'success',
      reference,
      amount: 0,
      paid_at: new Date().toISOString(),
    }) as Awaited<ReturnType<PaymentService['verifyPayment']>>,
};

describe('Invite-only discount campaigns (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: SeededUser;
  let invited: SeededUser;
  let outsider: SeededUser;
  let code: string;
  let campaignId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createE2eApp([{ token: PaymentService, value: fakePaystack }]);
    prisma = app.get(PrismaService);
    admin = await seedUser(app, 'invite-admin', UserRole.ADMIN);
    invited = await seedUser(app, 'invite-in', UserRole.USER);
    outsider = await seedUser(app, 'invite-out', UserRole.USER);
    code = `VIP${Date.now()}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an invite-only campaign scoped to the given users', async () => {
    const response = await http()
      .post('/discounts/admin/campaigns')
      .set(auth(admin))
      .send({
        name: 'VIP top-up',
        code,
        percentOff: 30,
        appliesTo: DiscountAppliesTo.CREDIT_TOP_UP,
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 60_000).toISOString(),
        eligibleUserIds: [invited.id],
      })
      .expect(201);
    expect(response.body.isInviteOnly).toBe(true);
    campaignId = response.body.id;
  });

  it('refuses an unknown user id at creation', async () => {
    await http()
      .post('/discounts/admin/campaigns')
      .set(auth(admin))
      .send({
        name: 'Broken invite list',
        code: `BAD${Date.now()}`,
        percentOff: 10,
        appliesTo: DiscountAppliesTo.ALL,
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 60_000).toISOString(),
        eligibleUserIds: ['00000000-0000-0000-0000-000000000000'],
      })
      .expect(400);
  });

  it('lets the invited user redeem the code', async () => {
    const response = await http()
      .post('/credits/buy')
      .set(auth(invited))
      .send({ credits: 1000, discountCode: code })
      .expect(201);
    expect(response.body.discountAmountInNaira).toBeGreaterThan(0);
  });

  it('refuses the code for someone not on the list, with the same message as an unknown code', async () => {
    const response = await http()
      .post('/credits/buy')
      .set(auth(outsider))
      .send({ credits: 1000, discountCode: code })
      .expect(400);
    expect(JSON.stringify(response.body)).toContain(
      'This discount code is not valid.',
    );
  });

  it("hides the campaign from an outsider's active-campaigns list but shows it to the invitee", async () => {
    const outsiderView = await http()
      .get('/discounts/active')
      .set(auth(outsider))
      .expect(200);
    expect(
      outsiderView.body.some((c: { code: string }) => c.code === code),
    ).toBe(false);

    const invitedView = await http()
      .get('/discounts/active')
      .set(auth(invited))
      .expect(200);
    expect(
      invitedView.body.some((c: { code: string }) => c.code === code),
    ).toBe(true);
  });

  it('lists the invitees for an admin', async () => {
    const response = await http()
      .get(`/discounts/admin/campaigns/${campaignId}/invitees`)
      .set(auth(admin))
      .expect(200);
    expect(response.body.invitees).toHaveLength(1);
    expect(response.body.invitees[0].id).toBe(invited.id);
  });

  it('lets an admin add the outsider and immediately unblocks them', async () => {
    await http()
      .put(`/discounts/admin/campaigns/${campaignId}/invitees`)
      .set(auth(admin))
      .send({ userIds: [invited.id, outsider.id] })
      .expect(200);

    await http()
      .post('/credits/buy')
      .set(auth(outsider))
      .send({ credits: 1000, discountCode: code })
      .expect(201);
  });

  it('reopens the code to anyone when the invite list is cleared', async () => {
    await http()
      .put(`/discounts/admin/campaigns/${campaignId}/invitees`)
      .set(auth(admin))
      .send({ userIds: [] })
      .expect(200);
    const campaign = await prisma.discountCampaign.findUniqueOrThrow({
      where: { id: campaignId },
    });
    expect(campaign.isInviteOnly).toBe(false);

    const freshUser = await seedUser(app, 'invite-late', UserRole.USER);
    await http()
      .post('/credits/buy')
      .set(auth(freshUser))
      .send({ credits: 1000, discountCode: code })
      .expect(201);
  });
});
