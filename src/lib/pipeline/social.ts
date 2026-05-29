// ─────────────────────────────────────────────
// FanPulse — Social Media Adapter (Placeholder)
//
// Currently scaffolded for Meta (Facebook/Instagram) and X (Twitter).
// Social APIs require app review/permissions — this adapter
// provides the structure; credentials and endpoints to be configured
// once API access is approved.
//
// Configure via:
//   SOCIAL_META_PAGE_ID=your-page-id
//   SOCIAL_META_ACCESS_TOKEN=...
//   SOCIAL_X_BEARER_TOKEN=...
// ─────────────────────────────────────────────

import axios from 'axios';
import { BaseAdapter } from './base';
import type { RawRecord, NormalisedSupporter, NormalisedEvent } from '@/types';

export class SocialAdapter extends BaseAdapter {
  readonly source = 'social' as const;

  async extract(): Promise<RawRecord[]> {
    const records: RawRecord[] = [];

    // Facebook / Instagram page engagement
    if (process.env.SOCIAL_META_ACCESS_TOKEN) {
      try {
        const metaRecords = await this.extractMetaEngagement();
        records.push(...metaRecords);
      } catch (err) {
        this.log.warn({ err }, 'Meta extraction failed — skipping');
      }
    }

    // NOTE: X/Twitter engagement data (likes, retweets, comments) requires
    // v2 API with Elevated access. Implement when credentials are available.

    if (records.length === 0) {
      this.log.info('No social credentials configured — returning empty dataset');
    }

    return records;
  }

  private async extractMetaEngagement(): Promise<RawRecord[]> {
    const pageId = process.env.SOCIAL_META_PAGE_ID;
    const accessToken = process.env.SOCIAL_META_ACCESS_TOKEN;

    if (!pageId || !accessToken) return [];

    // Fetch recent post engagement from the Graph API
    const response = await axios.get(
      `https://graph.facebook.com/v19.0/${pageId}/posts`,
      {
        params: {
          fields: 'id,message,created_time,likes.summary(true),comments.summary(true),shares',
          access_token: accessToken,
          limit: 50,
        },
      },
    );

    // Note: Meta's Graph API doesn't provide individual user identity
    // for privacy reasons. We get aggregate engagement metrics per post.
    // For individual-level tracking, use Meta's lead ads or pixel integrations.
    return (response.data as { data: RawRecord[] }).data ?? [];
  }

  async transform(raw: RawRecord[]): Promise<{
    supporters: NormalisedSupporter[];
    events: NormalisedEvent[];
    memberships: never[];
  }> {
    // Social data is currently aggregated (page-level), not individual-level.
    // Once individual engagement data is available (e.g. via lead ads),
    // implement supporter-level mapping here following the same pattern
    // as the ticketing and membership adapters.

    this.log.info(
      { rawCount: raw.length },
      'Social adapter: aggregate data ingested (no individual supporter mapping yet)',
    );

    // Store aggregate social metrics as metadata for reporting
    // Future: map identified followers/commenters to supporter profiles

    return { supporters: [], events: [], memberships: [] };
  }
}
