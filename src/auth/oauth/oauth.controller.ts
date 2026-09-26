import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { OAuthService } from './oauth.service';
import { OAuthExchangeDto } from './dto/oauth-exchange.dto';
import { getEnabledProviders } from './oauth-providers.config';
import {
  OAUTH_STATE_COOKIE,
  oauthStateCookieOptions,
  readOAuthStateCookie,
} from './oauth-state-cookie';

@ApiTags('Auth')
@Controller('auth/oauth')
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  @Get('providers')
  @ApiOperation({ summary: 'Social sign-in providers that are configured' })
  @ApiResponse({ status: 200, description: 'e.g. { providers: ["google"] }' })
  getProviders() {
    return { providers: getEnabledProviders() };
  }

  @Post('exchange')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Exchange the single-use OAuth callback code for a session',
  })
  @ApiResponse({ status: 200, description: 'Same payload as sign-in.' })
  @ApiResponse({ status: 401, description: 'Code invalid, used, or expired.' })
  async exchange(@Body() dto: OAuthExchangeDto) {
    return this.oauthService.exchange(dto.code);
  }

  @Get(':provider')
  @ApiOperation({ summary: 'Start Google/LinkedIn sign-in (browser redirect)' })
  @ApiParam({ name: 'provider', enum: ['google', 'linkedin'] })
  @ApiResponse({ status: 302, description: 'Redirect to the provider.' })
  @ApiResponse({ status: 404, description: 'Provider not configured.' })
  start(@Param('provider') provider: string, @Res() res: Response) {
    const config = this.oauthService.getConfigOrThrow(provider);
    const { url, state } = this.oauthService.startSignIn(config);
    res.cookie(OAUTH_STATE_COOKIE, state, oauthStateCookieOptions());
    res.redirect(url);
  }

  @Get(':provider/callback')
  @ApiOperation({ summary: 'Provider redirect target (browser only)' })
  @ApiParam({ name: 'provider', enum: ['google', 'linkedin'] })
  @ApiResponse({
    status: 302,
    description: 'Redirect to the frontend /auth/callback page.',
  })
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const config = this.oauthService.getConfigOrThrow(provider);
    const destination = await this.oauthService.completeSignIn(
      config,
      { code, state, error },
      readOAuthStateCookie(req),
    );
    res.clearCookie(OAUTH_STATE_COOKIE, oauthStateCookieOptions());
    res.redirect(destination);
  }
}
