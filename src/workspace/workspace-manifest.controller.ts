import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { WorkspaceTokenGuard } from './workspace-auth.guard';
import {
  type AudienceManifestEntry,
  WorkspaceAudiencesService,
} from './workspace-audiences';
import workspaceManifest from './workspace-manifest.json';

type WorkspaceManifest = typeof workspaceManifest & {
  audiences: AudienceManifestEntry[];
};

@ApiTags('JOS Workspace')
@Controller('admin')
export class WorkspaceManifestController {
  constructor(private readonly audiences: WorkspaceAudiencesService) {}

  @Get('workspace-manifest')
  @UseGuards(WorkspaceTokenGuard)
  @ApiOperation({
    summary: 'Admin modules this backend exposes to the JOS Workspace',
  })
  async getManifest(): Promise<WorkspaceManifest> {
    return {
      ...workspaceManifest,
      audiences: await this.audiences.manifestEntries(),
    };
  }
}
