import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { WorkspaceTokenGuard } from './workspace-auth.guard';
import workspaceManifest from './workspace-manifest.json';

@ApiTags('JOS Workspace')
@Controller('admin')
export class WorkspaceManifestController {
  @Get('workspace-manifest')
  @UseGuards(WorkspaceTokenGuard)
  @ApiOperation({
    summary: 'Admin modules this backend exposes to the JOS Workspace',
  })
  getManifest(): typeof workspaceManifest {
    return workspaceManifest;
  }
}
