import { V2CatalogService } from './v2-catalog.service';

function createCampaignEligibilityScope(
  productId: string,
  campaignType: string = 'POPUP',
) {
  return {
    include: {
      projectIds: new Set<string>(),
      productIds: new Set<string>([productId]),
      variantIds: new Set<string>(),
    },
    exclude: {
      projectIds: new Set<string>(),
      productIds: new Set<string>(),
      variantIds: new Set<string>(),
    },
    hasIncludeTargets: true,
    campaignType,
  };
}

function createProjectCampaignEligibilityScope(
  projectId: string,
  campaignType: string,
) {
  return {
    include: {
      projectIds: new Set<string>([projectId]),
      productIds: new Set<string>(),
      variantIds: new Set<string>(),
    },
    exclude: {
      projectIds: new Set<string>(),
      productIds: new Set<string>(),
      variantIds: new Set<string>(),
    },
    hasIncludeTargets: true,
    campaignType,
  };
}

function createUpdateCampaignSupabaseMock(
  updatedCampaign: Record<string, unknown>,
) {
  const campaignSingle = jest
    .fn()
    .mockResolvedValue({ data: updatedCampaign, error: null });
  const campaignSelect = jest.fn().mockReturnValue({ single: campaignSingle });
  const campaignEq = jest.fn().mockReturnValue({ select: campaignSelect });
  const campaignUpdate = jest.fn().mockReturnValue({ eq: campaignEq });

  const priceListIs = jest.fn().mockResolvedValue({ error: null });
  const priceListEq = jest.fn().mockReturnValue({ is: priceListIs });
  const priceListUpdate = jest.fn().mockReturnValue({ eq: priceListEq });

  const from = jest.fn((table: string) => {
    if (table === 'v2_campaigns') {
      return { update: campaignUpdate };
    }
    if (table === 'v2_price_lists') {
      return { update: priceListUpdate };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    supabase: { from },
    mocks: {
      from,
      campaignUpdate,
      campaignEq,
      campaignSelect,
      campaignSingle,
      priceListUpdate,
      priceListEq,
      priceListIs,
    },
  };
}

describe('V2CatalogService', () => {
  let service: V2CatalogService;

  beforeEach(() => {
    service = new V2CatalogService();
  });

  describe('filterShopPriceCandidates', () => {
    it('uses campaign period for campaign-linked price lists', () => {
      const productId = 'product-1';
      const variantId = 'variant-1';
      const campaignId = 'campaign-1';

      const result = (service as any).filterShopPriceCandidates({
        productId,
        projectId: null,
        variantId,
        priceItems: [
          {
            product_id: productId,
            variant_id: variantId,
            starts_at: null,
            ends_at: null,
            channel_scope_json: [],
            price_list: {
              campaign_id: campaignId,
              status: 'PUBLISHED',
              starts_at: '2099-01-01T00:00:00.000Z',
              ends_at: null,
              channel_scope_json: [],
              deleted_at: null,
              campaign: {
                id: campaignId,
                status: 'ACTIVE',
                starts_at: '2026-01-01T00:00:00.000Z',
                ends_at: null,
                channel_scope_json: [],
                deleted_at: null,
              },
            },
          },
        ],
        evaluatedAt: '2026-03-22T00:00:00.000Z',
        channel: 'WEB',
        campaignTargetEligibilityByCampaignId: new Map([
          [campaignId, createCampaignEligibilityScope(productId)],
        ]),
      });

      expect(result).toHaveLength(1);
    });

    it('keeps campaign period validation for campaign-linked price lists', () => {
      const productId = 'product-1';
      const variantId = 'variant-1';
      const campaignId = 'campaign-1';

      const result = (service as any).filterShopPriceCandidates({
        productId,
        projectId: null,
        variantId,
        priceItems: [
          {
            product_id: productId,
            variant_id: variantId,
            starts_at: null,
            ends_at: null,
            channel_scope_json: [],
            price_list: {
              campaign_id: campaignId,
              status: 'PUBLISHED',
              starts_at: '2026-01-01T00:00:00.000Z',
              ends_at: null,
              channel_scope_json: [],
              deleted_at: null,
              campaign: {
                id: campaignId,
                status: 'ACTIVE',
                starts_at: '2099-01-01T00:00:00.000Z',
                ends_at: null,
                channel_scope_json: [],
                deleted_at: null,
              },
            },
          },
        ],
        evaluatedAt: '2026-03-22T00:00:00.000Z',
        channel: 'WEB',
        campaignTargetEligibilityByCampaignId: new Map([
          [campaignId, createCampaignEligibilityScope(productId)],
        ]),
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('buildShopPriceSelectionFromCandidates', () => {
    it('falls back to ALWAYS_ON BASE when a non-base campaignId is provided', () => {
      const result = (service as any).buildShopPriceSelectionFromCandidates({
        candidates: [
          {
            id: 'base-item-1',
            price_list_id: 'base-list-1',
            unit_amount: 12000,
            starts_at: null,
            ends_at: null,
            channel_scope_json: [],
            price_list: {
              campaign_id: 'always-on-campaign',
              scope_type: 'BASE',
              status: 'PUBLISHED',
              channel_scope_json: [],
              deleted_at: null,
              campaign: {
                id: 'always-on-campaign',
                campaign_type: 'ALWAYS_ON',
                status: 'ACTIVE',
                starts_at: null,
                ends_at: null,
                channel_scope_json: [],
                deleted_at: null,
              },
            },
          },
        ],
        campaignId: 'popup-campaign',
        evaluatedAt: '2026-03-22T00:00:00.000Z',
        channel: 'WEB',
      });

      expect(result.base?.id).toBe('base-item-1');
      expect(result.override).toBeNull();
      expect(result.selected?.id).toBe('base-item-1');
    });

    it('keeps BASE selection for matching ALWAYS_ON campaignId', () => {
      const result = (service as any).buildShopPriceSelectionFromCandidates({
        candidates: [
          {
            id: 'base-item-1',
            price_list_id: 'base-list-1',
            unit_amount: 12000,
            starts_at: null,
            ends_at: null,
            channel_scope_json: [],
            price_list: {
              campaign_id: 'always-on-campaign',
              scope_type: 'BASE',
              status: 'PUBLISHED',
              channel_scope_json: [],
              deleted_at: null,
              campaign: {
                id: 'always-on-campaign',
                campaign_type: 'ALWAYS_ON',
                status: 'ACTIVE',
                starts_at: null,
                ends_at: null,
                channel_scope_json: [],
                deleted_at: null,
              },
            },
          },
        ],
        campaignId: 'always-on-campaign',
        evaluatedAt: '2026-03-22T00:00:00.000Z',
        channel: 'WEB',
      });

      expect(result.base?.id).toBe('base-item-1');
      expect(result.selected?.id).toBe('base-item-1');
    });
  });

  describe('selectShopPriceItem', () => {
    it('uses ALWAYS_ON BASE fallback only when the explicit campaign target includes the variant', () => {
      const productId = 'product-1';
      const variantId = 'variant-1';
      const popupCampaignId = 'popup-campaign';
      const alwaysOnCampaignId = 'always-on-campaign';
      const priceItems = [
        {
          id: 'base-item-1',
          product_id: productId,
          variant_id: variantId,
          unit_amount: 12000,
          starts_at: null,
          ends_at: null,
          channel_scope_json: [],
          price_list: {
            campaign_id: alwaysOnCampaignId,
            scope_type: 'BASE',
            status: 'PUBLISHED',
            channel_scope_json: [],
            deleted_at: null,
            campaign: {
              id: alwaysOnCampaignId,
              campaign_type: 'ALWAYS_ON',
              status: 'ACTIVE',
              starts_at: null,
              ends_at: null,
              channel_scope_json: [],
              deleted_at: null,
            },
          },
        },
      ];

      const targeted = (service as any).selectShopPriceItem({
        productId,
        projectId: null,
        variantId,
        priceItems,
        evaluatedAt: '2026-03-22T00:00:00.000Z',
        campaignId: popupCampaignId,
        channel: 'WEB',
        campaignTargetEligibilityByCampaignId: new Map([
          [alwaysOnCampaignId, createCampaignEligibilityScope(productId)],
          [popupCampaignId, createCampaignEligibilityScope(productId)],
        ]),
      });
      expect(targeted.selected?.id).toBe('base-item-1');

      const notTargeted = (service as any).selectShopPriceItem({
        productId,
        projectId: null,
        variantId,
        priceItems,
        evaluatedAt: '2026-03-22T00:00:00.000Z',
        campaignId: popupCampaignId,
        channel: 'WEB',
        campaignTargetEligibilityByCampaignId: new Map([
          [alwaysOnCampaignId, createCampaignEligibilityScope(productId)],
        ]),
      });
      expect(notTargeted.selected).toBeNull();
    });

    it('does not treat PROJECT targets as explicit inclusion for non-always campaigns', () => {
      const projectId = 'project-1';
      const productId = 'product-1';
      const variantId = 'variant-1';
      const popupCampaignId = 'popup-campaign';
      const alwaysOnCampaignId = 'always-on-campaign';
      const priceItems = [
        {
          id: 'base-item-1',
          product_id: productId,
          variant_id: variantId,
          unit_amount: 12000,
          starts_at: null,
          ends_at: null,
          channel_scope_json: [],
          price_list: {
            campaign_id: alwaysOnCampaignId,
            scope_type: 'BASE',
            status: 'PUBLISHED',
            channel_scope_json: [],
            deleted_at: null,
            campaign: {
              id: alwaysOnCampaignId,
              campaign_type: 'ALWAYS_ON',
              status: 'ACTIVE',
              starts_at: null,
              ends_at: null,
              channel_scope_json: [],
              deleted_at: null,
            },
          },
        },
      ];

      const result = (service as any).selectShopPriceItem({
        productId,
        projectId,
        variantId,
        priceItems,
        evaluatedAt: '2026-03-22T00:00:00.000Z',
        campaignId: popupCampaignId,
        channel: 'WEB',
        campaignTargetEligibilityByCampaignId: new Map([
          [
            alwaysOnCampaignId,
            createProjectCampaignEligibilityScope(projectId, 'ALWAYS_ON'),
          ],
          [
            popupCampaignId,
            createProjectCampaignEligibilityScope(projectId, 'POPUP'),
          ],
        ]),
      });

      expect(result.selected).toBeNull();
    });
  });

  describe('computePricingPipeline', () => {
    it('uses each quote line campaign when selecting prices for mixed campaign carts', async () => {
      const projectId = 'project-1';
      const popupCampaignId = 'popup-campaign';
      const alwaysOnCampaignId = 'always-on-campaign';
      const popupProductId = 'product-popup';
      const baseProductId = 'product-base';
      const popupVariantId = 'variant-popup';
      const baseVariantId = 'variant-base';

      const variants = [
        {
          id: popupVariantId,
          product_id: popupProductId,
          sku: 'POPUP',
          title: 'Popup Variant',
          fulfillment_type: 'PHYSICAL',
          requires_shipping: true,
          status: 'ACTIVE',
        },
        {
          id: baseVariantId,
          product_id: baseProductId,
          sku: 'BASE',
          title: 'Base Variant',
          fulfillment_type: 'PHYSICAL',
          requires_shipping: true,
          status: 'ACTIVE',
        },
      ];
      const products = [
        {
          id: popupProductId,
          project_id: projectId,
          title: 'Popup Product',
          product_kind: 'STANDARD',
          status: 'ACTIVE',
        },
        {
          id: baseProductId,
          project_id: projectId,
          title: 'Base Product',
          product_kind: 'STANDARD',
          status: 'ACTIVE',
        },
      ];
      const priceItems = [
        {
          id: 'popup-base-item',
          price_list_id: 'base-list-popup',
          product_id: popupProductId,
          variant_id: popupVariantId,
          status: 'ACTIVE',
          unit_amount: 12000,
          compare_at_amount: null,
          starts_at: null,
          ends_at: null,
          channel_scope_json: [],
          created_at: '2026-01-01T00:00:00.000Z',
          price_list: {
            id: 'base-list-popup',
            campaign_id: alwaysOnCampaignId,
            scope_type: 'BASE',
            status: 'PUBLISHED',
            currency_code: 'KRW',
            priority: 0,
            published_at: '2026-01-01T00:00:00.000Z',
            starts_at: null,
            ends_at: null,
            channel_scope_json: [],
            deleted_at: null,
            campaign: {
              id: alwaysOnCampaignId,
              campaign_type: 'ALWAYS_ON',
              status: 'ACTIVE',
              starts_at: null,
              ends_at: null,
              channel_scope_json: [],
              deleted_at: null,
            },
          },
        },
        {
          id: 'popup-override-item',
          price_list_id: 'popup-list',
          product_id: popupProductId,
          variant_id: popupVariantId,
          status: 'ACTIVE',
          unit_amount: 9000,
          compare_at_amount: 12000,
          starts_at: null,
          ends_at: null,
          channel_scope_json: [],
          created_at: '2026-01-02T00:00:00.000Z',
          price_list: {
            id: 'popup-list',
            campaign_id: popupCampaignId,
            scope_type: 'OVERRIDE',
            status: 'PUBLISHED',
            currency_code: 'KRW',
            priority: 10,
            published_at: '2026-01-02T00:00:00.000Z',
            starts_at: null,
            ends_at: null,
            channel_scope_json: [],
            deleted_at: null,
            campaign: {
              id: popupCampaignId,
              campaign_type: 'POPUP',
              status: 'ACTIVE',
              starts_at: null,
              ends_at: null,
              channel_scope_json: [],
              deleted_at: null,
            },
          },
        },
        {
          id: 'base-item',
          price_list_id: 'base-list',
          product_id: baseProductId,
          variant_id: baseVariantId,
          status: 'ACTIVE',
          unit_amount: 5000,
          compare_at_amount: null,
          starts_at: null,
          ends_at: null,
          channel_scope_json: [],
          created_at: '2026-01-01T00:00:00.000Z',
          price_list: {
            id: 'base-list',
            campaign_id: alwaysOnCampaignId,
            scope_type: 'BASE',
            status: 'PUBLISHED',
            currency_code: 'KRW',
            priority: 0,
            published_at: '2026-01-01T00:00:00.000Z',
            starts_at: null,
            ends_at: null,
            channel_scope_json: [],
            deleted_at: null,
            campaign: {
              id: alwaysOnCampaignId,
              campaign_type: 'ALWAYS_ON',
              status: 'ACTIVE',
              starts_at: null,
              ends_at: null,
              channel_scope_json: [],
              deleted_at: null,
            },
          },
        },
      ];

      const createInIsQuery = (rows: any[]) => ({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            is: jest.fn().mockResolvedValue({ data: rows, error: null }),
          }),
        }),
      });
      const priceItemsQuery = {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              is: jest
                .fn()
                .mockResolvedValue({ data: priceItems, error: null }),
            }),
          }),
        }),
      };
      const promotionsQuery = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            is: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      };
      const from = jest.fn((table: string) => {
        if (table === 'v2_product_variants') {
          return createInIsQuery(variants);
        }
        if (table === 'v2_products') {
          return createInIsQuery(products);
        }
        if (table === 'v2_price_list_items') {
          return priceItemsQuery;
        }
        if (table === 'v2_promotions') {
          return promotionsQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      });

      jest
        .spyOn(service as any, 'supabase', 'get')
        .mockReturnValue({ from } as any);
      jest
        .spyOn(service as any, 'getCampaignById')
        .mockResolvedValue({ id: popupCampaignId } as any);
      jest
        .spyOn(service as any, 'loadCampaignTargetEligibilityByCampaignIds')
        .mockResolvedValue(
          new Map([
            [
              alwaysOnCampaignId,
              createProjectCampaignEligibilityScope(projectId, 'ALWAYS_ON'),
            ],
            [
              popupCampaignId,
              createCampaignEligibilityScope(popupProductId, 'POPUP'),
            ],
          ]),
        );

      const quote = await (service as any).computePricingPipeline({
        lines: [
          {
            variant_id: popupVariantId,
            quantity: 1,
            campaign_id: popupCampaignId,
          },
          { variant_id: baseVariantId, quantity: 1 },
        ],
        channel: 'WEB',
        evaluated_at: '2026-06-27T00:00:00.000Z',
      });

      expect(quote.lines[0].campaign_id).toBe(popupCampaignId);
      expect(quote.lines[0].pricing.selected_price_list_id).toBe('popup-list');
      expect(quote.lines[0].pricing.unit_amount).toBe(9000);
      expect(quote.lines[1].campaign_id).toBeNull();
      expect(quote.lines[1].pricing.selected_price_list_id).toBe('base-list');
      expect(quote.lines[1].pricing.unit_amount).toBe(5000);
      expect(quote.summary.subtotal).toBe(14000);
    });
  });

  describe('updateCampaign', () => {
    const currentCampaign = {
      id: 'campaign-1',
      code: 'campaign-code',
      name: 'Campaign',
      campaign_type: 'POPUP',
      status: 'DRAFT',
      starts_at: '2026-03-21T17:00:00.000Z',
      ends_at: '2026-04-22T05:00:00.000Z',
      metadata: {},
    };

    it('syncs linked price list periods when campaign schedule changes', async () => {
      const updatedCampaign = {
        ...currentCampaign,
        starts_at: '2026-03-21T23:00:00.000Z',
        ends_at: '2026-04-22T05:00:00.000Z',
      };
      const { supabase, mocks } =
        createUpdateCampaignSupabaseMock(updatedCampaign);

      jest
        .spyOn(service as any, 'supabase', 'get')
        .mockReturnValue(supabase as any);
      jest
        .spyOn(service as any, 'getCampaignById')
        .mockResolvedValue(currentCampaign as any);

      await service.updateCampaign(currentCampaign.id, {
        starts_at: updatedCampaign.starts_at,
      });

      expect(mocks.priceListUpdate).toHaveBeenCalledWith({
        starts_at: updatedCampaign.starts_at,
        ends_at: updatedCampaign.ends_at,
      });
      expect(mocks.priceListEq).toHaveBeenCalledWith(
        'campaign_id',
        currentCampaign.id,
      );
      expect(mocks.priceListIs).toHaveBeenCalledWith('deleted_at', null);
    });

    it('does not sync linked price list periods when schedule is unchanged', async () => {
      const updatedCampaign = {
        ...currentCampaign,
        name: 'Updated Campaign',
      };
      const { supabase, mocks } =
        createUpdateCampaignSupabaseMock(updatedCampaign);

      jest
        .spyOn(service as any, 'supabase', 'get')
        .mockReturnValue(supabase as any);
      jest
        .spyOn(service as any, 'getCampaignById')
        .mockResolvedValue(currentCampaign as any);

      await service.updateCampaign(currentCampaign.id, {
        name: updatedCampaign.name,
      });

      expect(mocks.priceListUpdate).not.toHaveBeenCalled();
    });
  });
});
