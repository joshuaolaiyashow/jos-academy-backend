import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { ReferralService } from './referral.service';

@ApiTags('Referrals')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('referrals')
export class ReferralController {
  constructor(private readonly referrals: ReferralService) {}

  @Get('me')
  @ApiOperation({
    summary:
      "The caller's referral code, the people who signed up with it (Paid once they top up), and whether their own referee discount is still available",
  })
  @ApiResponse({ status: 200 })
  getMine(@Req() req: AuthenticatedRequest) {
    return this.referrals.getMine(req.user.id);
  }
}
