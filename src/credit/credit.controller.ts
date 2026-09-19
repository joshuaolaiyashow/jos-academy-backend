import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreditService } from './credit.service';
import { PaymentService } from '../payment/payment.service';
import { BuyCreditsDto } from './dto/buy-credits.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Credit Wallet & Purchases')
@Controller('credits')
export class CreditController {
  constructor(
    private readonly creditService: CreditService,
    private readonly paymentService: PaymentService,
  ) {}

  @Post('buy')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Buy credits via Paystack (10 Credits = ₦100, 1 Credit = ₦10)',
    description:
      'Initiates a Paystack checkout transaction for purchasing platform credits. Redirect the user to authorizationUrl.',
  })
  @ApiResponse({
    status: 201,
    description: 'Credit purchase initiated successfully.',
    schema: {
      example: {
        message: 'Credit purchase initiated. Please complete payment.',
        authorizationUrl: 'https://checkout.paystack.com/xxxxxx',
        accessCode: 'xxxxxx',
        reference: 'JOS-CRD-1725700000000-A1B2C3D4',
        credits: 100,
        amountInNaira: 1000,
        rate: '1 Credit = ₦10',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid credit amount.' })
  async buyCredits(@Req() req: any, @Body() buyCreditsDto: BuyCreditsDto) {
    return this.creditService.buyCredits(req.user.id, buyCreditsDto);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Paystack webhook listener (automatically credits user wallet upon payment)',
  })
  @ApiHeader({
    name: 'x-paystack-signature',
    description: 'HMAC SHA512 signature from Paystack',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook received and wallet credited.',
  })
  @ApiResponse({ status: 400, description: 'Invalid webhook signature.' })
  async handleWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Body() body: any,
  ) {
    const isValid = this.paymentService.verifyWebhookSignature(signature, body);
    if (!isValid) {
      throw new BadRequestException('Invalid Paystack webhook signature');
    }
    return this.creditService.handleWebhook(body);
  }

  @Get('balance')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get the logged-in student’s credit balance & Naira value',
  })
  @ApiResponse({
    status: 200,
    description: 'Current credit balance.',
    schema: {
      example: {
        credits: 100,
        nairaEquivalent: 1000,
        conversionRate: '1 Credit = ₦10 (10 Credits = ₦100)',
      },
    },
  })
  async getBalance(@Req() req: any) {
    return this.creditService.getBalance(req.user.id);
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get transaction history for student credit wallet',
  })
  @ApiResponse({
    status: 200,
    description: 'List of credit transactions (top-ups, course purchases, module purchases).',
  })
  async getTransactions(@Req() req: any) {
    return this.creditService.getTransactions(req.user.id);
  }
}
