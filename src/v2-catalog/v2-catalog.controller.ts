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

  @Get('media-assets')
  async getMediaAssets(
    @Headers('authorization') authorization: string | undefined,
    @Query('kind')
    kind?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'ARCHIVE' | 'FILE',
    @Query('status') status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED',
    @Query('search') search?: string,
  ) {
    await this.requireAdmin(authorization);
    const assets = await this.v2CatalogService.getMediaAssets({
      kind,
      status,
      search,
    });
    return successResponse(assets);
  }

  @Post('media-assets')
  async createMediaAsset(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const asset = await this.v2CatalogService.createMediaAsset(body);
    return successResponse(asset);
  }

  @Patch('media-assets/:id')
  async updateMediaAsset(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') mediaAssetId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const asset = await this.v2CatalogService.updateMediaAsset(mediaAssetId, body);
    return successResponse(asset);
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

  @Get('campaigns')
  async getCampaigns(
    @Headers('authorization') authorization: string | undefined,
    @Query('status') status?: 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED' | 'ARCHIVED',
    @Query('campaignType') campaignType?: 'POPUP' | 'EVENT' | 'SALE' | 'DROP' | 'ALWAYS_ON',
  ) {
    await this.requireAdmin(authorization);
    const campaigns = await this.v2CatalogService.getCampaigns({
      status,
      campaignType,
    });
    return successResponse(campaigns);
  }

  @Get('campaigns/:id')
  async getCampaignById(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') campaignId: string,
  ) {
    await this.requireAdmin(authorization);
    const campaign = await this.v2CatalogService.getCampaignById(campaignId);
    return successResponse(campaign);
  }

  @Post('campaigns')
  async createCampaign(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const campaign = await this.v2CatalogService.createCampaign(body);
    return successResponse(campaign);
  }

  @Patch('campaigns/:id')
  async updateCampaign(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') campaignId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const campaign = await this.v2CatalogService.updateCampaign(campaignId, body);
    return successResponse(campaign);
  }

  @Post('campaigns/:id/activate')
  async activateCampaign(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') campaignId: string,
  ) {
    await this.requireAdmin(authorization);
    const campaign = await this.v2CatalogService.activateCampaign(campaignId);
    return successResponse(campaign, 'campaign이 ACTIVE 상태로 전환되었습니다');
  }

  @Post('campaigns/:id/suspend')
  async suspendCampaign(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') campaignId: string,
  ) {
    await this.requireAdmin(authorization);
    const campaign = await this.v2CatalogService.suspendCampaign(campaignId);
    return successResponse(campaign, 'campaign이 SUSPENDED 상태로 전환되었습니다');
  }

  @Post('campaigns/:id/close')
  async closeCampaign(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') campaignId: string,
  ) {
    await this.requireAdmin(authorization);
    const campaign = await this.v2CatalogService.closeCampaign(campaignId);
    return successResponse(campaign, 'campaign이 CLOSED 상태로 전환되었습니다');
  }

  @Get('campaigns/:id/targets')
  async getCampaignTargets(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') campaignId: string,
  ) {
    await this.requireAdmin(authorization);
    const targets = await this.v2CatalogService.getCampaignTargets(campaignId);
    return successResponse(targets);
  }

  @Post('campaigns/:id/targets')
  async createCampaignTarget(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') campaignId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const target = await this.v2CatalogService.createCampaignTarget(campaignId, body);
    return successResponse(target);
  }

  @Patch('campaign-targets/:id')
  async updateCampaignTarget(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') targetId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const target = await this.v2CatalogService.updateCampaignTarget(targetId, body);
    return successResponse(target);
  }

  @Delete('campaign-targets/:id')
  async deleteCampaignTarget(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') targetId: string,
  ) {
    await this.requireAdmin(authorization);
    await this.v2CatalogService.deleteCampaignTarget(targetId);
    return successResponse({ message: 'campaign target이 삭제되었습니다' });
  }

  @Get('price-lists')
  async getPriceLists(
    @Headers('authorization') authorization: string | undefined,
    @Query('campaignId') campaignId?: string,
    @Query('scopeType') scopeType?: 'BASE' | 'OVERRIDE',
    @Query('status') status?: 'DRAFT' | 'PUBLISHED' | 'ROLLED_BACK' | 'ARCHIVED',
  ) {
    await this.requireAdmin(authorization);
    const priceLists = await this.v2CatalogService.getPriceLists({
      campaignId,
      scopeType,
      status,
    });
    return successResponse(priceLists);
  }

  @Get('price-lists/:id')
  async getPriceListById(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') priceListId: string,
  ) {
    await this.requireAdmin(authorization);
    const priceList = await this.v2CatalogService.getPriceListById(priceListId);
    return successResponse(priceList);
  }

  @Post('price-lists')
  async createPriceList(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const priceList = await this.v2CatalogService.createPriceList(body);
    return successResponse(priceList);
  }

  @Patch('price-lists/:id')
  async updatePriceList(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') priceListId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const priceList = await this.v2CatalogService.updatePriceList(priceListId, body);
    return successResponse(priceList);
  }

  @Post('price-lists/:id/publish')
  async publishPriceList(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') priceListId: string,
  ) {
    await this.requireAdmin(authorization);
    const priceList = await this.v2CatalogService.publishPriceList(priceListId);
    return successResponse(priceList, 'price list가 PUBLISHED 상태로 전환되었습니다');
  }

  @Post('price-lists/:id/rollback')
  async rollbackPriceList(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') priceListId: string,
  ) {
    await this.requireAdmin(authorization);
    const rollback = await this.v2CatalogService.rollbackPriceList(priceListId);
    return successResponse(rollback, 'price list rollback이 적용되었습니다');
  }

  @Get('price-lists/:id/items')
  async getPriceListItems(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') priceListId: string,
  ) {
    await this.requireAdmin(authorization);
    const items = await this.v2CatalogService.getPriceListItems(priceListId);
    return successResponse(items);
  }

  @Post('price-lists/:id/items')
  async createPriceListItem(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') priceListId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const item = await this.v2CatalogService.createPriceListItem(priceListId, body);
    return successResponse(item);
  }

  @Patch('price-list-items/:id')
  async updatePriceListItem(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') itemId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const item = await this.v2CatalogService.updatePriceListItem(itemId, body);
    return successResponse(item);
  }

  @Post('price-list-items/:id/deactivate')
  async deactivatePriceListItem(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') itemId: string,
  ) {
    await this.requireAdmin(authorization);
    const item = await this.v2CatalogService.deactivatePriceListItem(itemId);
    return successResponse(item, 'price list item이 INACTIVE 상태로 전환되었습니다');
  }

  @Get('promotions')
  async getPromotions(
    @Headers('authorization') authorization: string | undefined,
    @Query('campaignId') campaignId?: string,
    @Query('status') status?: 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED',
    @Query('couponRequired') couponRequired?: string,
  ) {
    await this.requireAdmin(authorization);
    const promotions = await this.v2CatalogService.getPromotions({
      campaignId,
      status,
      couponRequired: this.parseBoolean(couponRequired),
    });
    return successResponse(promotions);
  }

  @Get('promotions/:id')
  async getPromotionById(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') promotionId: string,
  ) {
    await this.requireAdmin(authorization);
    const promotion = await this.v2CatalogService.getPromotionById(promotionId);
    return successResponse(promotion);
  }

  @Post('promotions')
  async createPromotion(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const promotion = await this.v2CatalogService.createPromotion(body);
    return successResponse(promotion);
  }

  @Patch('promotions/:id')
  async updatePromotion(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') promotionId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const promotion = await this.v2CatalogService.updatePromotion(promotionId, body);
    return successResponse(promotion);
  }

  @Get('promotions/:id/rules')
  async getPromotionRules(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') promotionId: string,
  ) {
    await this.requireAdmin(authorization);
    const rules = await this.v2CatalogService.getPromotionRules(promotionId);
    return successResponse(rules);
  }

  @Post('promotions/:id/rules')
  async createPromotionRule(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') promotionId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const rule = await this.v2CatalogService.createPromotionRule(promotionId, body);
    return successResponse(rule);
  }

  @Patch('promotion-rules/:id')
  async updatePromotionRule(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') ruleId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const rule = await this.v2CatalogService.updatePromotionRule(ruleId, body);
    return successResponse(rule);
  }

  @Get('coupons')
  async getCoupons(
    @Headers('authorization') authorization: string | undefined,
    @Query('promotionId') promotionId?: string,
    @Query('status') status?:
      | 'DRAFT'
      | 'ACTIVE'
      | 'PAUSED'
      | 'EXHAUSTED'
      | 'EXPIRED'
      | 'ARCHIVED',
  ) {
    await this.requireAdmin(authorization);
    const coupons = await this.v2CatalogService.getCoupons({
      promotionId,
      status,
    });
    return successResponse(coupons);
  }

  @Get('coupons/:id')
  async getCouponById(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') couponId: string,
  ) {
    await this.requireAdmin(authorization);
    const coupon = await this.v2CatalogService.getCouponById(couponId);
    return successResponse(coupon);
  }

  @Get('coupon-redemptions')
  async getCouponRedemptions(
    @Headers('authorization') authorization: string | undefined,
    @Query('couponId') couponId?: string,
    @Query('userId') userId?: string,
    @Query('status') status?: 'RESERVED' | 'APPLIED' | 'RELEASED' | 'CANCELED' | 'EXPIRED',
    @Query('quoteReference') quoteReference?: string,
  ) {
    await this.requireAdmin(authorization);
    const redemptions = await this.v2CatalogService.getCouponRedemptions({
      couponId,
      userId,
      status,
      quoteReference,
    });
    return successResponse(redemptions);
  }

  @Post('coupons')
  async createCoupon(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const coupon = await this.v2CatalogService.createCoupon(body);
    return successResponse(coupon);
  }

  @Patch('coupons/:id')
  async updateCoupon(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') couponId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const coupon = await this.v2CatalogService.updateCoupon(couponId, body);
    return successResponse(coupon);
  }

  @Post('coupons/validate')
  async validateCoupon(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2CatalogService.validateCoupon(body);
    return successResponse(result);
  }

  @Post('coupons/:id/reserve')
  async reserveCoupon(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') couponId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2CatalogService.reserveCoupon(couponId, body);
    return successResponse(result);
  }

  @Post('coupon-redemptions/:id/release')
  async releaseCouponRedemption(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') redemptionId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2CatalogService.releaseCouponRedemption(
      redemptionId,
      body,
    );
    return successResponse(result);
  }

  @Post('coupon-redemptions/:id/redeem')
  async redeemCouponRedemption(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') redemptionId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2CatalogService.redeemCouponRedemption(
      redemptionId,
      body,
    );
    return successResponse(result);
  }

  @Post('pricing/quote')
  async buildPriceQuote(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const quote = await this.v2CatalogService.buildPriceQuote(body);
    return successResponse(quote);
  }

  @Post('pricing/promotions/evaluate')
  async evaluatePromotions(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2CatalogService.evaluatePromotions(body);
    return successResponse(result);
  }

  @Post('pricing/debug')
  async getPricingDebugTrace(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    await this.requireAdmin(authorization);
    const debugTrace = await this.v2CatalogService.getPricingDebugTrace(body);
    return successResponse(debugTrace);
  }

  @Get('pricing/order-snapshot-contract')
  async getOrderSnapshotContract(
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.requireAdmin(authorization);
    const contract = this.v2CatalogService.getOrderSnapshotContract();
    return successResponse(contract);
  }

  private async requireAdmin(authorization: string | undefined): Promise<void> {
    if (this.authSessionService.isLocalAdminBypassEnabled()) {
      return;
    }

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

  private parseBoolean(value?: string): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
    return undefined;
  }
}
