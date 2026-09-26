import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CertificateService } from './certificate.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

@ApiTags('Certificates')
@Controller('certificates')
export class CertificateController {
  constructor(private readonly certificateService: CertificateService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: "List the logged-in learner's certificates" })
  @ApiResponse({ status: 200, description: 'Certificates, newest first.' })
  async getMyCertificates(@Req() req: AuthenticatedRequest) {
    return this.certificateService.getMyCertificates(req.user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Public certificate verification — what is printed on it',
  })
  @ApiParam({ name: 'id', description: 'Certificate ID (UUID)' })
  @ApiResponse({ status: 200, description: 'The certificate.' })
  @ApiResponse({ status: 404, description: 'Certificate not found.' })
  async getCertificate(@Param('id', ParseUUIDPipe) id: string) {
    return this.certificateService.getCertificate(id);
  }
}
