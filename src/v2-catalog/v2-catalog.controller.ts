import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthSessionService } from '../auth/auth-session.service';
import { successResponse } from '../common/api-response';
import { ApiException } from '../common/errors/api.exception';
import { V2CatalogService } from './v2-catalog.service';

@Controller('v2/catalog/admin')
export class V2CatalogController {
  constructor(
    private readonly v2CatalogService: V2CatalogService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  @Get('migration/compare-report')
  async getMigrationCompareReport(
    @Headers('authorization') authorization: string | undefined,
    @Query('sampleLimit') sampleLimit?: string,
  ) {
    await this.requireAdmin(authorization);
    const report = await this.v2CatalogService.getMigrationCompareReport(
      this.parseSampleLimit(sampleLimit),
    );
    return successResponse(report);
  }

  @Get('migration/read-switch-checklist')
  async getReadSwitchChecklist(
    @Headers('authorization') authorization: string | undefined,
    @Query('sampleLimit') sampleLimit?: string,
  ) {
    await this.requireAdmin(authorization);
    const checklist = await this.v2CatalogService.getReadSwitchChecklist(
      this.parseSampleLimit(sampleLimit),
    );
    return successResponse(checklist);
  }

  @Get('migration/remediation-tasks')
  async getReadSwitchRemediationTasks(
    @Headers('authorization') authorization: string | undefined,
    @Query('sampleLimit') sampleLimit?: string,
  ) {
    await this.requireAdmin(authorization);
    const tasks = await this.v2CatalogService.getReadSwitchRemediationTasks(
      this.parseSampleLimit(sampleLimit),
    );
    return successResponse(tasks);
  }

  @Get('bundles/definitions')
  async getBundleDefinitions(
    @Headers('authorization') authorization: string | undefined,
    @Query('bundleProductId') bundleProductId?: string,
    @Query('status') status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED',
  ) {
    await this.requireAdmin(authorization);
    const definitions = await this.v2CatalogService.getBundleDefinitions({
      bundleProductId,
      status,
    });
    return successResponse(definitions);
  }

  @Get('bundles/definitions/:id')
  async getBundleDefinitionById(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') definitionId: string,
  ) {
    await this.requireAdmin(authorization);
    const definition = await this.v2CatalogService.getBundleDefinitionById(
      definitionId,
    );
    return successResponse(definition);
  }

  @Post('bundles/definitions')
  async createBundleDefinition(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const definition = await this.v2CatalogService.createBundleDefinition(body);
    return successResponse(definition);
  }

  @Patch('bundles/definitions/:id')
  async updateBundleDefinition(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') definitionId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const definition = await this.v2CatalogService.updateBundleDefinition(
      definitionId,
      body,
    );
    return successResponse(definition);
  }

  @Post('bundles/definitions/:id/publish')
  async publishBundleDefinition(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') definitionId: string,
  ) {
    await this.requireAdmin(authorization);
    const definition = await this.v2CatalogService.publishBundleDefinition(
      definitionId,
    );
    return successResponse(
      definition,
      'bundle definition이 ACTIVE 상태로 변경되었습니다',
    );
  }

  @Post('bundles/definitions/:id/archive')
  async archiveBundleDefinition(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') definitionId: string,
  ) {
    await this.requireAdmin(authorization);
    const definition = await this.v2CatalogService.archiveBundleDefinition(
      definitionId,
    );
    return successResponse(
      definition,
      'bundle definition이 ARCHIVED 상태로 변경되었습니다',
    );
  }

  @Post('bundles/definitions/:id/clone-version')
  async cloneBundleDefinitionVersion(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') definitionId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const definition = await this.v2CatalogService.cloneBundleDefinitionVersion(
      definitionId,
      body,
    );
    return successResponse(definition, 'bundle definition 신규 버전이 생성되었습니다');
  }

  @Get('bundles/definitions/:id/components')
  async getBundleComponents(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') definitionId: string,
  ) {
    await this.requireAdmin(authorization);
    const components = await this.v2CatalogService.getBundleComponents(definitionId);
    return successResponse(components);
  }

  @Post('bundles/definitions/:id/components')
  async createBundleComponent(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') definitionId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const component = await this.v2CatalogService.createBundleComponent(
      definitionId,
      body,
    );
    return successResponse(component);
  }

  @Patch('bundles/components/:id')
  async updateBundleComponent(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') componentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const component = await this.v2CatalogService.updateBundleComponent(
      componentId,
      body,
    );
    return successResponse(component);
  }

  @Post('bundles/components/:id/options')
  async createBundleComponentOption(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') componentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const option = await this.v2CatalogService.createBundleComponentOption(
      componentId,
      body,
    );
    return successResponse(option);
  }

  @Patch('bundles/component-options/:id')
  async updateBundleComponentOption(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') optionId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const option = await this.v2CatalogService.updateBundleComponentOption(
      optionId,
      body,
    );
    return successResponse(option);
  }

  @Delete('bundles/component-options/:id')
  async deleteBundleComponentOption(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') optionId: string,
  ) {
    await this.requireAdmin(authorization);
    await this.v2CatalogService.deleteBundleComponentOption(optionId);
    return successResponse({ message: 'bundle component option이 삭제되었습니다' });
  }

  @Delete('bundles/components/:id')
  async deleteBundleComponent(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') componentId: string,
  ) {
    await this.requireAdmin(authorization);
    await this.v2CatalogService.deleteBundleComponent(componentId);
    return successResponse({ message: 'bundle component가 삭제되었습니다' });
  }

  @Post('bundles/definitions/:id/validate')
  async validateBundleDefinition(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') definitionId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const validation = await this.v2CatalogService.validateBundleDefinition(
      definitionId,
      body,
    );
    return successResponse(validation);
  }

  @Post('bundles/preview')
  async previewBundle(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const preview = await this.v2CatalogService.previewBundle(body);
    return successResponse(preview);
  }

  @Post('bundles/resolve')
  async resolveBundle(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2CatalogService.resolveBundle(body);
    return successResponse(result);
  }

  @Post('bundles/ops-contract')
  async buildBundleOpsContract(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const contract = await this.v2CatalogService.buildBundleOpsContract(body);
    return successResponse(contract);
  }

  @Post('bundles/canary-report')
  async buildBundleCanaryReport(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const report = await this.v2CatalogService.buildBundleCanaryReport(body);
    return successResponse(report);
  }

  @Get('projects')
  async getProjects(
    @Headers('authorization') authorization: string | undefined,
    @Query('status') status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED',
  ) {
    await this.requireAdmin(authorization);
    const projects = await this.v2CatalogService.getProjects({ status });
    return successResponse(projects);
  }

  @Get('projects/:id')
  async getProjectById(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') projectId: string,
  ) {
    await this.requireAdmin(authorization);
    const project = await this.v2CatalogService.getProjectById(projectId);
    return successResponse(project);
  }

  @Post('projects')
  async createProject(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const project = await this.v2CatalogService.createProject(body);
    return successResponse(project);
  }

  @Patch('projects/:id')
  async updateProject(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') projectId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const project = await this.v2CatalogService.updateProject(projectId, body);
    return successResponse(project);
  }

  @Patch('projects/:id/publish')
  async publishProject(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') projectId: string,
  ) {
    await this.requireAdmin(authorization);
    const project = await this.v2CatalogService.publishProject(projectId);
    return successResponse(project, '프로젝트가 publish 상태로 변경되었습니다');
  }

  @Patch('projects/:id/unpublish')
  async unpublishProject(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') projectId: string,
  ) {
    await this.requireAdmin(authorization);
    const project = await this.v2CatalogService.unpublishProject(projectId);
    return successResponse(project, '프로젝트가 unpublish 상태로 변경되었습니다');
  }

  @Delete('projects/:id')
  async deleteProject(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') projectId: string,
  ) {
    await this.requireAdmin(authorization);
    await this.v2CatalogService.deleteProject(projectId);
    return successResponse({ message: '프로젝트가 삭제되었습니다' });
  }

  @Get('artists')
  async getArtists(
    @Headers('authorization') authorization: string | undefined,
    @Query('projectId') projectId?: string,
  ) {
    await this.requireAdmin(authorization);
    const artists = await this.v2CatalogService.getArtists({ projectId });
    return successResponse(artists);
  }

  @Get('artists/:id')
  async getArtistById(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') artistId: string,
  ) {
    await this.requireAdmin(authorization);
    const artist = await this.v2CatalogService.getArtistById(artistId);
    return successResponse(artist);
  }

  @Post('artists')
  async createArtist(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const artist = await this.v2CatalogService.createArtist(body);
    return successResponse(artist);
  }

  @Patch('artists/:id')
  async updateArtist(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') artistId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const artist = await this.v2CatalogService.updateArtist(artistId, body);
    return successResponse(artist);
  }

  @Post('projects/:projectId/artists/:artistId/link')
  async linkArtistToProject(
    @Headers('authorization') authorization: string | undefined,
    @Param('projectId') projectId: string,
    @Param('artistId') artistId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const relation = await this.v2CatalogService.linkArtistToProject(
      projectId,
      artistId,
      body,
    );
    return successResponse(relation);
  }

  @Delete('projects/:projectId/artists/:artistId/link')
  async unlinkArtistFromProject(
    @Headers('authorization') authorization: string | undefined,
    @Param('projectId') projectId: string,
    @Param('artistId') artistId: string,
  ) {
    await this.requireAdmin(authorization);
    await this.v2CatalogService.unlinkArtistFromProject(projectId, artistId);
    return successResponse({ message: '프로젝트-아티스트 연결이 해제되었습니다' });
  }

  @Get('products')
  async getProducts(
    @Headers('authorization') authorization: string | undefined,
    @Query('projectId') projectId?: string,
    @Query('status') status?: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED',
  ) {
    await this.requireAdmin(authorization);
    const products = await this.v2CatalogService.getProducts({ projectId, status });
    return successResponse(products);
  }

  @Get('products/:id')
  async getProductById(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') productId: string,
  ) {
    await this.requireAdmin(authorization);
    const product = await this.v2CatalogService.getProductById(productId);
    return successResponse(product);
  }

  @Post('products')
  async createProduct(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const product = await this.v2CatalogService.createProduct(body);
    return successResponse(product);
  }

  @Patch('products/:id')
  async updateProduct(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') productId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const product = await this.v2CatalogService.updateProduct(productId, body);
    return successResponse(product);
  }

  @Delete('products/:id')
  async deleteProduct(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') productId: string,
  ) {
    await this.requireAdmin(authorization);
    await this.v2CatalogService.deleteProduct(productId);
    return successResponse({ message: '상품이 삭제되었습니다' });
  }

  @Get('products/:productId/variants')
  async getVariants(
    @Headers('authorization') authorization: string | undefined,
    @Param('productId') productId: string,
  ) {
    await this.requireAdmin(authorization);
    const variants = await this.v2CatalogService.getVariants(productId);
    return successResponse(variants);
  }

  @Post('products/:productId/variants')
  async createVariant(
    @Headers('authorization') authorization: string | undefined,
    @Param('productId') productId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const variant = await this.v2CatalogService.createVariant(productId, body);
    return successResponse(variant);
  }

  @Patch('variants/:id')
  async updateVariant(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') variantId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const variant = await this.v2CatalogService.updateVariant(variantId, body);
    return successResponse(variant);
  }

  @Delete('variants/:id')
  async deleteVariant(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') variantId: string,
  ) {
    await this.requireAdmin(authorization);
    await this.v2CatalogService.deleteVariant(variantId);
    return successResponse({ message: 'variant가 삭제되었습니다' });
  }

  @Get('products/:productId/media')
  async getProductMedia(
    @Headers('authorization') authorization: string | undefined,
    @Param('productId') productId: string,
  ) {
    await this.requireAdmin(authorization);
    const media = await this.v2CatalogService.getProductMedia(productId);
    return successResponse(media);
  }

  @Post('products/:productId/media')
  async createProductMedia(
    @Headers('authorization') authorization: string | undefined,
    @Param('productId') productId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const media = await this.v2CatalogService.createProductMedia(productId, body);
    return successResponse(media);
  }

  @Patch('media/:id')
  async updateProductMedia(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') mediaId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const media = await this.v2CatalogService.updateProductMedia(mediaId, body);
    return successResponse(media);
  }

  @Post('media/:id/deactivate')
  async deactivateProductMedia(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') mediaId: string,
  ) {
    await this.requireAdmin(authorization);
    const media = await this.v2CatalogService.deactivateProductMedia(mediaId);
    return successResponse(media);
  }

  @Get('variants/:variantId/assets')
  async getVariantAssets(
    @Headers('authorization') authorization: string | undefined,
    @Param('variantId') variantId: string,
  ) {
    await this.requireAdmin(authorization);
    const assets = await this.v2CatalogService.getVariantAssets(variantId);
    return successResponse(assets);
  }

  @Post('variants/:variantId/assets')
  async createDigitalAsset(
    @Headers('authorization') authorization: string | undefined,
    @Param('variantId') variantId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const asset = await this.v2CatalogService.createDigitalAsset(variantId, body);
    return successResponse(asset);
  }

  @Patch('assets/:id')
  async updateDigitalAsset(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') assetId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const asset = await this.v2CatalogService.updateDigitalAsset(assetId, body);
    return successResponse(asset);
  }

  @Post('assets/:id/activate')
  async activateDigitalAsset(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') assetId: string,
  ) {
    await this.requireAdmin(authorization);
    const asset = await this.v2CatalogService.activateDigitalAsset(assetId);
    return successResponse(asset);
  }

  @Post('assets/:id/deactivate')
  async deactivateDigitalAsset(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') assetId: string,
  ) {
    await this.requireAdmin(authorization);
    const asset = await this.v2CatalogService.deactivateDigitalAsset(assetId);
    return successResponse(asset);
  }

  @Get('products/:productId/publish-readiness')
  async getProductPublishReadiness(
    @Headers('authorization') authorization: string | undefined,
    @Param('productId') productId: string,
  ) {
    await this.requireAdmin(authorization);
    const readiness = await this.v2CatalogService.getProductPublishReadiness(
      productId,
    );
    return successResponse(readiness);
  }

  private async requireAdmin(authorization: string | undefined): Promise<void> {
    const user = await this.authSessionService.requireUser(authorization);
    if (!this.authSessionService.isAdmin(user.email)) {
      throw new ApiException('관리자 권한이 필요합니다', 403, 'ADMIN_REQUIRED');
    }
  }

  private parseSampleLimit(value?: string): number {
    if (!value) {
      return 20;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return 20;
    }
    return parsed;
  }
}
