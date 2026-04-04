import { V2CatalogService } from './v2-catalog.service';

function createCampaignEligibilityScope(productId: string) {
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
    it('does not fall back to another campaign BASE when campaignId is provided', () => {
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

      expect(result.base).toBeNull();
      expect(result.override).toBeNull();
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
