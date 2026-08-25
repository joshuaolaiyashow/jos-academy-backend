import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sign-up')
  @ApiOperation({ summary: 'Register a new user and send email verification link' })
  @ApiResponse({ status: 201, description: 'Registration successful. Verification email sent.' })
  @ApiResponse({ status: 400, description: 'Bad Request - Validation error.' })
  @ApiResponse({ status: 409, description: 'Conflict - Email already exists.' })
  async signUp(@Body() createUserDto: RegisterDto) {
    return this.authService.signUp(createUserDto);
  }

  @Get('verify-email')
  @ApiOperation({ summary: 'Verify user email address using link token' })
  @ApiQuery({ name: 'token', required: true, description: 'Email verification token from email link' })
  @ApiResponse({ status: 200, description: 'Email verified successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid or expired token.' })
  async verifyEmailQuery(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify user email address using token payload' })
  @ApiResponse({ status: 200, description: 'Email verified successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid or expired token.' })
  async verifyEmailBody(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }
}
