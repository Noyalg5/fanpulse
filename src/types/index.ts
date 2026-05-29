// ─────────────────────────────────────────────
// FanPulse — Shared Types
// ─────────────────────────────────────────────

export type DataSource = 'ticketing' | 'membership' | 'ecommerce' | 'social' | 'website' | 'email';

export type EventType =
  // Ticketing
  | 'ticket_purchased'
  | 'match_attended'
  | 'ticket_refunded'
  | 'ticket_transferred'
  // E-commerce
  | 'merch_purchased'
  | 'cart_abandoned'
  // Membership
  | 'membership_joined'
  | 'membership_renewed'
  | 'membership_lapsed'
  | 'membership_cancelled'
  // Social
  | 'post_liked'
  | 'post_shared'
  | 'comment_made'
  // Website
  | 'page_viewed'
  | 'video_watched'
  | 'form_submitted'
  // Email
  | 'email_opened'
  | 'email_clicked'
  | 'email_bounced'
  | 'email_unsubscribed';

export type SupporterSegment =
  | 'champion'         // High RFM — your most engaged fans
  | 'loyal'            // Frequent, long-term supporters
  | 'potential_loyalist' // Good engagement but relatively new
  | 'new_fan'          // Recent first interaction
  | 'at_risk'          // Previously engaged, starting to disengage
  | 'lapsed'           // Inactive for 6+ months
  | 'casual'           // Low frequency, low spend
  | 'hibernating';     // Very long inactive period

// ─────────────────────────────────────────────
// Pipeline types
// ─────────────────────────────────────────────

/** Raw record as extracted from a source system — before any transformation */
export interface RawRecord {
  [key: string]: unknown;
}

/** Normalised supporter data ready to upsert into the database */
export interface NormalisedSupporter {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  postcode?: string;
  dateOfBirth?: Date;
  gender?: string;
  emailConsent?: boolean;
  smsConsent?: boolean;
  consentDate?: Date;
  consentSource?: string;
  externalIds?: Record<string, string>;
}

/** Normalised event record ready to upsert */
export interface NormalisedEvent {
  supporterEmail: string;
  source: DataSource;
  eventType: EventType | string;
  eventDate: Date;
  value?: number;
  metadata?: Record<string, unknown>;
  externalId?: string;
}

/** Normalised membership record */
export interface NormalisedMembership {
  supporterEmail: string;
  type: string;
  status: 'active' | 'expired' | 'cancelled' | 'pending';
  tier?: string;
  startDate: Date;
  endDate?: Date;
  renewalDate?: Date;
  pricePaid?: number;
  externalId?: string;
}

/** Returned by adapter.load() after inserting/updating records */
export interface LoadResult {
  processed: number;
  created: number;
  updated: number;
  failed: number;
  errors: string[];
}

/** Returned by a full adapter run */
export interface PipelineRunResult {
  source: DataSource;
  status: 'success' | 'partial' | 'failed';
  logId: string;
  processed: number;
  created: number;
  updated: number;
  failed: number;
  durationMs: number;
  error?: string;
}

// ─────────────────────────────────────────────
// Enrichment types
// ─────────────────────────────────────────────

export interface RFMScores {
  recency: number;    // 1–5 (5 = most recent)
  frequency: number;  // 1–5 (5 = most frequent)
  monetary: number;   // 1–5 (5 = highest spend)
  combined: number;   // Weighted average 0–100
}

export interface SupporterMetrics {
  supporterId: string;
  rfm: RFMScores;
  segment: SupporterSegment;
  lifetimeValue: number;
  churnRisk: number;
  engagementScore: number;
}
