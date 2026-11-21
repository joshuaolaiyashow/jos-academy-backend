import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import workspaceManifest from './workspace-manifest.json';

@ApiTags('JOS Workspace')
@Controller('admin')
export class WorkspaceManifestController {
  // Structure only, no data. shortcut: public until the Keycloak cutover gates it, because the workspace fetches it with a Keycloak token the current JWT guard rejects.
  @Get('workspace-manifest')
  @ApiOperation({
    summary: 'Admin modules this backend exposes to the JOS Workspace',
  })
  getManifest(): typeof workspaceManifest {
    return workspaceManifest;
  }
}
