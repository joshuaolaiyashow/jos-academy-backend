import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Logger,
  Param,
  Query,
  Redirect,
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
import { paymentResultUrl } from './credit-callback';

@ApiTags('Credit Wallet & Purchases')
@Controller('credits')
export class CreditController {
  private readonly logger = new Logger(CreditController.name);

  constructor(
    private readonly creditService: CreditService,
    private readonly paymentService: PaymentService,
  ) {}

  @Post('buy')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Buy credits via Paystack (1 Credit = $1)',
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
        amountInUsd: 100,
        rate: '1 Credit = $1',
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

  /**
   * PAYSTACK_CALLBACK_URL points here. Paystack sends the buyer's browser (not its
   * servers), so it works on localhost with no tunnel. Public on purpose: it only credits
   * the account that created the payment, and only after Paystack confirms it.
   */
  @Get('paystack/callback')
  @Redirect()
  @ApiOperation({
    summary:
      'Paystack redirect after checkout: verifies the payment, credits the wallet once, then redirects to the credits page',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirects to the frontend credits page.',
  })
  async paystackCallback(
    @Query('reference') reference?: string,
    @Query('trxref') trxref?: string,
  ) {
    const paymentReference = reference ?? trxref;
    if (!paymentReference) return { url: paymentResultUrl('failed') };
    try {
      await this.creditService.verifyCreditPayment(paymentReference);
      return { url: paymentResultUrl('success') };
    } catch (error: unknown) {
      this.logger.warn(
        `Paystack callback could not credit ${paymentReference}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { url: paymentResultUrl('failed') };
    }
  }

  @Get('verify/:reference')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Check a top-up with Paystack and credit the wallet if it succeeded (safe to repeat)',
  })
  @ApiResponse({ status: 200, description: 'Credited, or already processed.' })
  @ApiResponse({
    status: 400,
    description: 'Paystack reports the payment did not succeed.',
  })
  @ApiResponse({
    status: 404,
    description: 'No top-up with this reference for this user.',
  })
  verifyPayment(@Req() req: any, @Param('reference') reference: string) {
    return this.creditService.verifyOwnCreditPayment(req.user, reference);
  }

  @Get('balance')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get the logged-in student’s credit balance & USD value',
  })
  @ApiResponse({
    status: 200,
    description: 'Current credit balance.',
    schema: {
      example: {
        credits: 100,
        usdEquivalent: 100,
        conversionRate: '1 Credit = $1',
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
    description:
      'List of credit transactions (top-ups, course purchases, module purchases).',
  })
  async getTransactions(@Req() req: any) {
    return this.creditService.getTransactions(req.user.id);
  }
}
