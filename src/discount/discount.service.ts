import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_TARGETS } from '../audit/audit-actions';
import {
  DiscountAppliesTo,
  DiscountTarget,
  PaymentStatus,
  Prisma,
} from '../generated/prisma/client';
import { ValidateDiscountDto } from './dto/validate-discount.dto';
import {
  CreateDiscountCampaignDto,
  UpdateDiscountCampaignDto,
} from './dto/create-discount-campaign.dto';

type DbClient = PrismaService | Prisma.TransactionClient;

export interface ResolvedDiscount {
  campaignId: string;
  code: string;
  name: string;
  percentOff: number;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
}

@Injectable()
export class DiscountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  /**
   * Redemptions already settled, plus (for a top-up, whose discount is only
   * settled once Paystack confirms payment) top-ups still pending on this
   * code. Without the pending count, a buyer could open many discounted
   * checkouts before any of them redeemed and pay for every one of them.
   */
  private async countCommitments(
    client: DbClient,
    campaignId: string,
    target: DiscountTarget,
    userId?: string,
  ): Promise<number> {
    const redemptions = await client.discountRedemption.count({
      where: { campaignId, ...(userId ? { userId } : {}) },
    });
    if (target !== DiscountTarget.CREDIT_TOP_UP) {
      return redemptions;
    }
    const pendingCheckouts = await client.payment.count({
      where: {
        discountCampaignId: campaignId,
        status: PaymentStatus.PENDING,
        ...(userId ? { userId } : {}),
      },
    });
    return redemptions + pendingCheckouts;
  }

  /**
   * Checks a code against every rule (active, dates, target, total cap,
   * per-user cap) and returns the discounted price. Throws a 400 with a
   * specific reason otherwise. Does not record anything.
   */
  async resolveDiscount(
    userId: string,
    rawCode: string,
    target: DiscountTarget,
    amount: number,
    client: DbClient = this.prisma,
  ): Promise<ResolvedDiscount> {
    const campaign = await client.discountCampaign.findUnique({
      where: { code: this.normalizeCode(rawCode) },
    });
    if (!campaign || !campaign.isActive) {
      throw new BadRequestException('This discount code is not valid.');
    }

    const now = new Date();
    if (now < campaign.startsAt) {
      throw new BadRequestException(
        'This discount campaign has not started yet.',
      );
    }
    if (now > campaign.endsAt) {
      throw new BadRequestException('This discount campaign has ended.');
    }
    if (
      campaign.appliesTo !== DiscountAppliesTo.ALL &&
      (campaign.appliesTo as string) !== (target as string)
    ) {
      throw new BadRequestException(
        campaign.appliesTo === DiscountAppliesTo.CREDIT_TOP_UP
          ? 'This code only applies to credit top-ups.'
          : 'This code only applies to course and module purchases.',
      );
    }

    if (campaign.maxRedemptions !== null) {
      const used = await this.countCommitments(client, campaign.id, target);
      if (used >= campaign.maxRedemptions) {
        throw new BadRequestException(
          'This discount code has been fully redeemed.',
        );
      }
    }

    const usedByUser = await this.countCommitments(
      client,
      campaign.id,
      target,
      userId,
    );
    if (usedByUser >= campaign.perUserLimit) {
      throw new ConflictException('You have already used this discount code.');
    }

    const discountAmount = Math.floor((amount * campaign.percentOff) / 100);
    return {
      campaignId: campaign.id,
      code: campaign.code,
      name: campaign.name,
      percentOff: campaign.percentOff,
      originalAmount: amount,
      discountAmount,
      finalAmount: amount - discountAmount,
    };
  }

  async recordRedemption(
    client: DbClient,
    params: {
      campaignId: string;
      userId: string;
      target: DiscountTarget;
      originalAmount: number;
      discountAmount: number;
      finalAmount: number;
      reference?: string;
    },
  ) {
    return client.discountRedemption.create({ data: params });
  }

  async validate(userId: string, dto: ValidateDiscountDto) {
    const resolved = await this.resolveDiscount(
      userId,
      dto.code,
      dto.target,
      dto.amount,
    );
    return { valid: true, ...resolved };
  }

  async listActive(userId: string) {
    const now = new Date();
    const campaigns = await this.prisma.discountCampaign.findMany({
      where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { endsAt: 'asc' },
      include: {
        _count: { select: { redemptions: true } },
        redemptions: { where: { userId }, select: { id: true } },
      },
    });

    return campaigns
      .filter(
        (c) =>
          c.maxRedemptions === null || c._count.redemptions < c.maxRedemptions,
      )
      .map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        description: c.description,
        percentOff: c.percentOff,
        appliesTo: c.appliesTo,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        alreadyUsed: c.redemptions.length >= c.perUserLimit,
      }));
  }

  async myRedemptions(userId: string) {
    const redemptions = await this.prisma.discountRedemption.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        campaign: { select: { name: true, code: true, percentOff: true } },
      },
    });
    return { total: redemptions.length, redemptions };
  }

  async createCampaign(adminId: string, dto: CreateDiscountCampaignDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }

    const code = this.normalizeCode(dto.code);
    const existing = await this.prisma.discountCampaign.findUnique({
      where: { code },
    });
    if (existing) {
      throw new ConflictException(
        `A campaign with code "${code}" already exists.`,
      );
    }

    const created = await this.prisma.discountCampaign.create({
      data: {
        name: dto.name,
        code,
        description: dto.description,
        percentOff: dto.percentOff,
        appliesTo: dto.appliesTo,
        startsAt,
        endsAt,
        maxRedemptions: dto.maxRedemptions,
        perUserLimit: dto.perUserLimit ?? 1,
        createdById: adminId,
      },
    });
    await this.audit.record({
      action: AUDIT_ACTIONS.DISCOUNT_CAMPAIGN_CREATED,
      targetType: AUDIT_TARGETS.DISCOUNT_CAMPAIGN,
      targetId: created.id,
      metadata: { code: created.code, percentOff: created.percentOff },
    });
    return created;
  }

  async updateCampaign(id: string, dto: UpdateDiscountCampaignDto) {
    const campaign = await this.prisma.discountCampaign.findUnique({
      where: { id },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign with ID "${id}" not found`);
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : campaign.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : campaign.endsAt;
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }

    let code: string | undefined;
    if (dto.code) {
      code = this.normalizeCode(dto.code);
      const clash = await this.prisma.discountCampaign.findUnique({
        where: { code },
      });
      if (clash && clash.id !== id) {
        throw new ConflictException(
          `A campaign with code "${code}" already exists.`,
        );
      }
    }

    const updated = await this.prisma.discountCampaign.update({
      where: { id },
      data: {
        name: dto.name,
        code,
        description: dto.description,
        percentOff: dto.percentOff,
        appliesTo: dto.appliesTo,
        startsAt: dto.startsAt ? startsAt : undefined,
        endsAt: dto.endsAt ? endsAt : undefined,
        maxRedemptions: dto.maxRedemptions,
        perUserLimit: dto.perUserLimit,
        isActive: dto.isActive,
      },
    });
    await this.audit.record({
      action: AUDIT_ACTIONS.DISCOUNT_CAMPAIGN_UPDATED,
      targetType: AUDIT_TARGETS.DISCOUNT_CAMPAIGN,
      targetId: id,
      // Field names only: which settings changed, not a copy of the whole campaign.
      metadata: { changedFields: Object.keys(dto) },
    });
    return updated;
  }

  async listCampaigns() {
    const [campaigns, totals] = await Promise.all([
      this.prisma.discountCampaign.findMany({
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { redemptions: true } } },
      }),
      this.prisma.discountRedemption.groupBy({
        by: ['campaignId'],
        _sum: { discountAmount: true },
      }),
    ]);

    const savedByCampaign = new Map(
      totals.map((row) => [row.campaignId, row._sum.discountAmount ?? 0]),
    );

    return {
      total: campaigns.length,
      campaigns: campaigns.map((c) => ({
        ...c,
        redemptionCount: c._count.redemptions,
        totalDiscountGiven: savedByCampaign.get(c.id) ?? 0,
      })),
    };
  }

  async listCampaignRedemptions(campaignId: string) {
    const campaign = await this.prisma.discountCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign with ID "${campaignId}" not found`);
    }

    const redemptions = await this.prisma.discountRedemption.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return { campaign, total: redemptions.length, redemptions };
  }
}
