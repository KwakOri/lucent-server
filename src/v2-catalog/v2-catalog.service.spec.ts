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
    it('falls back to product option BASE when a campaignId is provided', () => {
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
              campaign_id: null,
              scope_type: 'BASE',
              status: 'PUBLISHED',
              channel_scope_json: [],
              deleted_at: null,
              campaign: null,
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

    it('does not expose product option BASE without a selling campaign context', () => {
      const result = (service as any).buildShopPriceSelectionFromCandidates({
        candidates: [
          {
            id: 'legacy-always-on-base-item',
            price_list_id: 'legacy-always-on-base-list',
            unit_amount: 35000,
            starts_at: null,
            ends_at: null,
            channel_scope_json: [],
            price_list: {
              campaign_id: 'always-on-campaign',
              scope_type: 'BASE',
              status: 'PUBLISHED',
              priority: 0,
              published_at: '2026-03-23T00:00:00.000Z',
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
          {
            id: 'product-option-base-item',
            price_list_id: 'product-option-base-list',
            unit_amount: 350000,
            starts_at: null,
            ends_at: null,
            channel_scope_json: [],
            price_list: {
              campaign_id: null,
              scope_type: 'BASE',
              status: 'PUBLISHED',
              priority: 100,
              published_at: '2026-06-29T00:00:00.000Z',
              channel_scope_json: [],
              deleted_at: null,
              campaign: null,
            },
          },
        ],
        campaignId: null,
        evaluatedAt: '2026-06-29T03:00:00.000Z',
        channel: 'WEB',
      });

      expect(result.base?.id).toBe('legacy-always-on-base-item');
      expect(result.selected?.unit_amount).toBe(35000);
    });

    it('does not use another campaign-linked BASE for an explicit campaign', () => {
      const result = (service as any).buildShopPriceSelectionFromCandidates({
        candidates: [
          {
            id: 'always-on-base-item',
            price_list_id: 'always-on-base-list',
            unit_amount: 35000,
            starts_at: null,
            ends_at: null,
            channel_scope_json: [],
            price_list: {
              campaign_id: 'always-on-campaign',
              scope_type: 'BASE',
              status: 'PUBLISHED',
              priority: 0,
              published_at: '2026-03-23T00:00:00.000Z',
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
        evaluatedAt: '2026-06-29T03:00:00.000Z',
        channel: 'WEB',
      });

      expect(result.base).toBeNull();
      expect(result.selected).toBeNull();
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

    it('keeps the explicit selling campaign context for product option BASE display prices', () => {
      const displayPrice = (service as any).buildShopDisplayPrice(
        {
          id: 'base-item-1',
          price_list_id: 'base-list-1',
          unit_amount: 12000,
          compare_at_amount: null,
          price_list: {
            campaign_id: null,
            scope_type: 'BASE',
            currency_code: 'KRW',
          },
        },
        'popup-campaign',
      );

      expect(displayPrice.source).toBe('BASE');
      expect(displayPrice.campaign_id).toBeNull();
      expect(displayPrice.selling_campaign_id).toBe('popup-campaign');
      expect(displayPrice.price_list_item_id).toBe('base-item-1');
    });

    it('uses updated_at as a tie-breaker for same-priority BASE items', () => {
      const sharedPriceList = {
        campaign_id: null,
        scope_type: 'BASE',
        status: 'PUBLISHED',
        priority: 100,
        published_at: '2026-06-29T00:00:00.000Z',
        channel_scope_json: [],
        deleted_at: null,
        campaign: null,
      };

      const result = (service as any).buildShopPriceSelectionFromCandidates({
        candidates: [
          {
            id: 'base-item-old',
            price_list_id: 'base-list-1',
            unit_amount: 1000,
            starts_at: null,
            ends_at: null,
            channel_scope_json: [],
            created_at: '2026-06-29T00:00:00.000Z',
            updated_at: '2026-06-29T01:00:00.000Z',
            price_list: sharedPriceList,
          },
          {
            id: 'base-item-new',
            price_list_id: 'base-list-1',
            unit_amount: 2000,
            starts_at: null,
            ends_at: null,
            channel_scope_json: [],
            created_at: '2026-06-29T00:00:00.000Z',
            updated_at: '2026-06-29T02:00:00.000Z',
            price_list: sharedPriceList,
          },
        ],
        campaignId: 'popup-campaign',
        evaluatedAt: '2026-06-29T03:00:00.000Z',
        channel: 'WEB',
      });

      expect(result.base?.id).toBe('base-item-new');
      expect(result.selected?.unit_amount).toBe(2000);
    });
  });

  describe('base price override propagation helpers', () => {
    it('recomputes percent discount overrides from the next BASE amount', () => {
      const result = (service as any).buildBasePriceOverrideImpact({
        item: {
          id: 'override-1',
          price_list_id: 'override-list',
          product_id: 'product-1',
          variant_id: 'variant-1',
          unit_amount: 31500,
          compare_at_amount: 35000,
          status: 'ACTIVE',
          metadata: {
            pricing_mode: 'PERCENT_DISCOUNT',
            discount_value: 10,
            base_amount: 35000,
          },
          price_list: {
            campaign_id: 'campaign-1',
            campaign: { id: 'campaign-1', name: 'Campaign' },
          },
        },
        nextBaseAmount: 100000,
        currentBaseAmount: 35000,
      });

      expect(result.pricing_mode).toBe('PERCENT_DISCOUNT');
      expect(result.can_auto_propagate).toBe(true);
      expect(result.default_action).toBe('PROPAGATE');
      expect(result.next_unit_amount).toBe(90000);
      expect(result.next_compare_at_amount).toBe(100000);
    });

    it('recomputes fixed discount overrides from the next BASE amount', () => {
      const result = (service as any).buildBasePriceOverrideImpact({
        item: {
          id: 'override-1',
          price_list_id: 'override-list',
          product_id: 'product-1',
          variant_id: 'variant-1',
          unit_amount: 30000,
          compare_at_amount: 35000,
          status: 'ACTIVE',
          metadata: {
            pricing_mode: 'FIXED_DISCOUNT',
            discount_value: 5000,
            base_amount: 35000,
          },
          price_list: { campaign_id: 'campaign-1' },
        },
        nextBaseAmount: 100000,
        currentBaseAmount: 35000,
      });

      expect(result.next_unit_amount).toBe(95000);
      expect(result.can_auto_propagate).toBe(true);
    });

    it('keeps direct price overrides by default', () => {
      const result = (service as any).buildBasePriceOverrideImpact({
        item: {
          id: 'override-1',
          price_list_id: 'override-list',
          product_id: 'product-1',
          variant_id: 'variant-1',
          unit_amount: 25000,
          compare_at_amount: 35000,
          status: 'ACTIVE',
          metadata: {
            pricing_mode: 'DIRECT_PRICE',
            discount_value: 25000,
            base_amount: 35000,
          },
          price_list: { campaign_id: 'campaign-1' },
        },
        nextBaseAmount: 100000,
        currentBaseAmount: 35000,
      });

      expect(result.next_unit_amount).toBe(25000);
      expect(result.default_action).toBe('KEEP');
      expect(result.can_auto_propagate).toBe(false);
    });

    it('marks missing pricing metadata as non-propagatable', () => {
      const result = (service as any).buildBasePriceOverrideImpact({
        item: {
          id: 'override-1',
          price_list_id: 'override-list',
          product_id: 'product-1',
          variant_id: 'variant-1',
          unit_amount: 25000,
          compare_at_amount: 35000,
          status: 'ACTIVE',
          metadata: {},
          price_list: { campaign_id: 'campaign-1' },
        },
        nextBaseAmount: 100000,
        currentBaseAmount: 35000,
      });

      expect(result.pricing_mode).toBe('UNKNOWN');
      expect(result.default_action).toBe('SKIP');
      expect(result.can_auto_propagate).toBe(false);
    });
  });

  describe('selectShopPriceItem', () => {
    it('uses product option BASE only when the explicit campaign target includes the variant', () => {
      const productId = 'product-1';
      const variantId = 'variant-1';
      const popupCampaignId = 'popup-campaign';
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
            campaign_id: null,
            scope_type: 'BASE',
            status: 'PUBLISHED',
            channel_scope_json: [],
            deleted_at: null,
            campaign: null,
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
        campaignTargetEligibilityByCampaignId: new Map(),
      });
      expect(notTargeted.selected).toBeNull();
    });

    it('uses product option BASE for non-always campaigns with PROJECT targets', () => {
      const projectId = 'project-1';
      const productId = 'product-1';
      const variantId = 'variant-1';
      const popupCampaignId = 'popup-campaign';
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
            campaign_id: null,
            scope_type: 'BASE',
            status: 'PUBLISHED',
            channel_scope_json: [],
            deleted_at: null,
            campaign: null,
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
            popupCampaignId,
            createProjectCampaignEligibilityScope(projectId, 'POPUP'),
          ],
        ]),
      });

      expect(result.selected?.id).toBe('base-item-1');
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

  describe('createCampaignTarget', () => {
    it('restores a soft-deleted target instead of inserting a duplicate', async () => {
      const deletedTarget = {
        id: 'target-1',
        campaign_id: 'campaign-1',
        target_type: 'VARIANT',
        target_id: 'variant-1',
        deleted_at: '2026-06-29T00:00:00.000Z',
      };
      const restoredTarget = {
        ...deletedTarget,
        sort_order: 3,
        is_excluded: false,
        metadata: { source: 'campaign-detail' },
        deleted_at: null,
      };
      const findQuery: any = {
        eq: jest.fn(() => findQuery),
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: deletedTarget, error: null }),
      };
      const updateQuery: any = {
        eq: jest.fn(() => updateQuery),
        select: jest.fn(() => updateQuery),
        single: jest
          .fn()
          .mockResolvedValue({ data: restoredTarget, error: null }),
      };
      const targetSelect = jest.fn(() => findQuery);
      const targetUpdate = jest.fn(() => updateQuery);
      const targetInsert = jest.fn();
      const from = jest.fn((table: string) => {
        if (table === 'v2_campaign_targets') {
          return {
            select: targetSelect,
            update: targetUpdate,
            insert: targetInsert,
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      });

      jest
        .spyOn(service as any, 'supabase', 'get')
        .mockReturnValue({ from } as any);
      jest.spyOn(service as any, 'getCampaignById').mockResolvedValue({
        id: 'campaign-1',
        campaign_type: 'POPUP',
        status: 'ACTIVE',
      } as any);
      jest
        .spyOn(service as any, 'ensureCampaignTargetEntityExists')
        .mockResolvedValue(undefined);

      const result = await service.createCampaignTarget('campaign-1', {
        target_type: 'VARIANT',
        target_id: 'variant-1',
        sort_order: 3,
        is_excluded: false,
        metadata: { source: 'campaign-detail' },
      });

      expect(result).toEqual(restoredTarget);
      expect(targetInsert).not.toHaveBeenCalled();
      expect(targetUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign_id: 'campaign-1',
          target_type: 'VARIANT',
          target_id: 'variant-1',
          sort_order: 3,
          is_excluded: false,
          metadata: { source: 'campaign-detail' },
          deleted_at: null,
        }),
      );
      expect(updateQuery.eq).toHaveBeenCalledWith('id', 'target-1');
    });
  });
});
