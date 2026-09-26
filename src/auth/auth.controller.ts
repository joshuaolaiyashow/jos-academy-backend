import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgetPasswordDto } from './dto/forget-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sign-up')
  @ApiOperation({
    summary: 'Register a new user and send email verification link',
  })
  @ApiResponse({
    status: 201,
    description: 'Registration successful. Verification email sent.',
  })
  @ApiResponse({ status: 400, description: 'Bad Request - Validation error.' })
  @ApiResponse({ status: 409, description: 'Conflict - Email already exists.' })
  async signUp(@Body() createUserDto: RegisterDto) {
    return this.authService.signUp(createUserDto);
  }

  @Post('sign-in')
  @ApiOperation({ summary: 'Sign in user and return JWT access token' })
  @ApiResponse({
    status: 200,
    description: 'Login successful. Returns access token and user info.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid credentials or unverified email.',
  })
  async signIn(@Body() loginDto: LoginDto) {
    return this.authService.signIn(loginDto);
  }

  @Get('verify-email')
  @ApiOperation({ summary: 'Verify user email address using link token' })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'Email verification token from email link',
  })
  @ApiResponse({ status: 200, description: 'Email verified successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid or expired token.',
  })
  async verifyEmailQuery(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify user email address using token payload' })
  @ApiResponse({ status: 200, description: 'Email verified successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid or expired token.',
  })
  async verifyEmailBody(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Re-send the email verification link to an unverified account',
  })
  @ApiResponse({
    status: 200,
    description:
      'Always returns the same generic message, whether or not the account exists.',
  })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto);
  }

  @Post('forget-password')
  @ApiOperation({
    summary: 'Initiate password reset by sending a 6-digit OTP to user email',
  })
  @ApiResponse({
    status: 200,
    description: 'OTP code sent successfully to user email.',
  })
  @ApiResponse({ status: 404, description: 'Not Found - User does not exist.' })
  async forgetPassword(@Body() dto: ForgetPasswordDto) {
    return this.authService.forgetPassword(dto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using the 6-digit OTP code' })
  @ApiResponse({ status: 200, description: 'Password reset successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid or expired OTP code.',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Exchange a refresh token for a new access/refresh token pair',
  })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully.' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid, expired, or revoked refresh token.',
  })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke a refresh token (sign out this device)' })
  @ApiResponse({ status: 200, description: 'Logged out successfully.' })
  async logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Patch('change-password')
  @ApiOperation({
    summary:
      "Change the logged-in user's password (also clears mustChangePassword)",
  })
  @ApiResponse({ status: 200, description: 'Password changed successfully.' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token.',
  })
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Authenticated user profile.' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token.',
  })
  async getProfile(@Request() req: any) {
    return req.user;
  }
}
