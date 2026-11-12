import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrencyService, LocalCurrency } from './currency.service';
import { LocalCurrencyQueryDto } from './dto/local-currency-query.dto';

@ApiTags('Currency')
@Controller('currency')
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Get('local')
  @ApiOperation({
    summary:
      'Display currency and USD rate for the visitor’s time zone (prices are charged in USD)',
  })
  @ApiResponse({
    status: 200,
    schema: { example: { currency: 'NGN', usdRate: 1000 } },
  })
  async getLocalCurrency(
    @Query() query: LocalCurrencyQueryDto,
  ): Promise<LocalCurrency> {
    return this.currencyService.getLocalCurrency(query.timeZone);
  }
}
