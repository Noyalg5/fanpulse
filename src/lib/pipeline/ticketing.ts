// ─────────────────────────────────────────────
// FanPulse — Ticketing Adapter
//
// Supports two ingestion modes:
//   1. REST API (e.g. TicketCo, Eventbrite, or custom ticketing system)
//   2. CSV file upload (for systems that only export spreadsheets)
//
// Configure via environment variables:
//   TICKETING_MODE=api|csv
//   TICKETING_CSV_PATH=/path/to/export.csv
//
// Column name flexibility
// ───────────────────────
// The adapter normalises incoming column names before validation, so it works
// even if the ticketing system uses different names (e.g. "Email" vs "customer_email").
//
// Built-in aliases cover the most common variations. For a system that uses
// completely different names, set TICKETING_FIELD_MAP to a JSON object that maps
// your system's column names to FanPulse's expected names:
//
//   TICKETING_FIELD_MAP='{"EmailAddress":"customer_email","TicketRef":"ticket_id","MatchDate":"fixture_date"}'
//
// See docs/csv-templates/ticketing-import-template.csv for the full column reference.
// ─────────────────────────────────────────────

import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import axios from 'axios';
import { z } from 'zod';
import { BaseAdapter } from './base';
import type { RawRecord, NormalisedSupporter, NormalisedEvent, NormalisedMembership } from '@/types';

// ── Column alias map ──────────────────────────────────────────────────────────
// Maps FanPulse's canonical field names → all known column name variants from
// real ticketing systems. First match wins. Add new aliases here as you encounter
// them; never remove existing ones.

const COLUMN_ALIASES: Record<string, string[]> = {
  customer_email:   ['customer_email', 'email', 'Email', 'EMAIL', 'CustomerEmail',
                     'buyer_email', 'BuyerEmail', 'EmailAddress', 'email_address',
                     'purchaser_email', 'account_email', 'contact_email'],

  first_name:       ['first_name', 'FirstName', 'first name', 'First Name',
                     'forename', 'Forename', 'given_name', 'GivenName',
                     'fname', 'FName'],

  last_name:        ['last_name', 'LastName', 'last name', 'Last Name',
                     'surname', 'Surname', 'family_name', 'FamilyName',
                     'lname', 'LName'],

  phone:            ['phone', 'Phone', 'mobile', 'Mobile', 'telephone', 'Telephone',
                     'phone_number', 'PhoneNumber', 'mobile_number', 'MobileNumber',
                     'contact_number', 'ContactNumber'],

  postcode:         ['postcode', 'Postcode', 'PostCode', 'post_code',
                     'zip', 'Zip', 'zip_code', 'ZipCode', 'postal_code', 'PostalCode'],

  ticket_id:        ['ticket_id', 'TicketID', 'ticket_no', 'TicketNo',
                     'ticket_number', 'TicketNumber', 'ticket_ref', 'TicketRef',
                     'barcode', 'Barcode', 'ticket_barcode', 'id', 'ID'],

  order_id:         ['order_id', 'OrderID', 'order_no', 'OrderNo',
                     'order_number', 'OrderNumber', 'order_ref', 'OrderRef',
                     'transaction_id', 'TransactionID', 'booking_ref', 'BookingRef'],

  fixture_id:       ['fixture_id', 'FixtureID', 'match_id', 'MatchID',
                     'event_id', 'EventID', 'game_id', 'GameID',
                     'fixture_code', 'FixtureCode', 'match_code'],

  fixture_name:     ['fixture_name', 'FixtureName', 'match_name', 'MatchName',
                     'event_name', 'EventName', 'fixture', 'Fixture',
                     'match', 'Match', 'game', 'Game', 'description', 'Description'],

  fixture_date:     ['fixture_date', 'FixtureDate', 'match_date', 'MatchDate',
                     'event_date', 'EventDate', 'game_date', 'GameDate',
                     'date', 'Date', 'event_start', 'EventStart',
                     'kick_off', 'KickOff', 'match_datetime'],

  stand:            ['stand', 'Stand', 'area', 'Area', 'section', 'Section',
                     'block', 'Block', 'enclosure', 'Enclosure', 'zone', 'Zone',
                     'terrace', 'Terrace', 'stand_name', 'StandName'],

  seat_row:         ['seat_row', 'SeatRow', 'row', 'Row', 'row_number', 'RowNumber'],

  seat_number:      ['seat_number', 'SeatNumber', 'seat', 'Seat',
                     'seat_no', 'SeatNo', 'seat_num', 'SeatNum'],

  ticket_price:     ['ticket_price', 'TicketPrice', 'price', 'Price',
                     'amount', 'Amount', 'total', 'Total',
                     'face_value', 'FaceValue', 'net_price', 'gross_price',
                     'value', 'Value', 'cost', 'Cost'],

  currency:         ['currency', 'Currency', 'currency_code', 'CurrencyCode'],

  status:           ['status', 'Status', 'ticket_status', 'TicketStatus',
                     'order_status', 'OrderStatus', 'booking_status'],

  marketing_opt_in: ['marketing_opt_in', 'MarketingOptIn', 'marketing_consent',
                     'MarketingConsent', 'opt_in', 'OptIn', 'email_opt_in',
                     'email_consent', 'EmailConsent', 'gdpr_consent',
                     'newsletter', 'Newsletter', 'allows_marketing'],

  is_season_ticket: ['is_season_ticket', 'IsSeasonTicket', 'season_ticket',
                     'SeasonTicket', 'is_st', 'IsST', 'season_pass',
                     'SeasonPass', 'annual_pass', 'AnnualPass'],

  season:           ['season', 'Season', 'season_year', 'SeasonYear',
                     'season_code', 'SeasonCode'],
};

// ── Validation schema ─────────────────────────────────────────────────────────

const TicketingRecordSchema = z.object({
  customer_email:   z.string().email(),
  first_name:       z.string().optional(),
  last_name:        z.string().optional(),
  phone:            z.string().optional(),
  postcode:         z.string().optional(),

  ticket_id:        z.string(),
  order_id:         z.string().optional(),
  fixture_id:       z.string().optional(),
  fixture_name:     z.string().optional(),
  fixture_date:     z.string(),

  stand:            z.string().optional(),
  seat_row:         z.string().optional(),
  seat_number:      z.string().optional(),

  ticket_price:     z.coerce.number().optional(),
  currency:         z.string().default('GBP'),

  status:           z.enum(['sold', 'refunded', 'transferred', 'complimentary']).default('sold'),

  marketing_opt_in: z.union([z.boolean(), z.string()]).optional(),
  is_season_ticket: z.union([z.boolean(), z.string()]).optional(),
  season:           z.string().optional(),
});

type TicketingRecord = z.infer<typeof TicketingRecordSchema>;

// ── Column normalisation ──────────────────────────────────────────────────────

/**
 * Remaps raw column names to FanPulse's canonical names using:
 *   1. TICKETING_FIELD_MAP env var (highest priority, for full custom mapping)
 *   2. COLUMN_ALIASES (covers common variations automatically)
 *   3. Pass-through for any unrecognised columns (harmless)
 */
function normaliseColumns(raw: RawRecord): RawRecord {
  // Parse custom mapping from env (optional)
  let customMap: Record<string, string> = {};
  const envMap = process.env.TICKETING_FIELD_MAP;
  if (envMap) {
    try {
      customMap = JSON.parse(envMap);
    } catch {
      // Malformed JSON — skip custom map, use aliases only
    }
  }

  const normalised: RawRecord = { ...raw }; // start with a copy so unknown cols pass through

  for (const [canonicalName, aliases] of Object.entries(COLUMN_ALIASES)) {
    // Skip if the canonical name is already present in the raw record
    if (raw[canonicalName] !== undefined) continue;

    // 1. Custom env map takes priority
    const customSourceKey = customMap[canonicalName];
    if (customSourceKey && raw[customSourceKey] !== undefined) {
      normalised[canonicalName] = raw[customSourceKey];
      continue;
    }

    // 2. Try each alias in order
    for (const alias of aliases) {
      if (raw[alias] !== undefined) {
        normalised[canonicalName] = raw[alias];
        break;
      }
    }
  }

  return normalised;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class TicketingAdapter extends BaseAdapter {
  readonly source = 'ticketing' as const;

  async extract(): Promise<RawRecord[]> {
    const mode = process.env.TICKETING_MODE ?? 'csv';
    return mode === 'api' ? this.extractFromApi() : this.extractFromCsv();
  }

  private async extractFromApi(): Promise<RawRecord[]> {
    const baseUrl = process.env.TICKETING_API_URL;
    const apiKey = process.env.TICKETING_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error('TICKETING_API_URL and TICKETING_API_KEY must be set for API mode');
    }

    this.log.info({ baseUrl }, 'Fetching from ticketing API');

    const records: RawRecord[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await axios.get(`${baseUrl}/tickets`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        params: {
          page,
          per_page: 200,
          updated_since: process.env.TICKETING_LAST_SYNC ?? undefined,
        },
      });

      const { data, meta } = response.data as {
        data: RawRecord[];
        meta: { current_page: number; last_page: number };
      };

      records.push(...data);
      hasMore = meta.current_page < meta.last_page;
      page++;
      this.log.debug({ page, fetched: records.length }, 'API pagination progress');
    }

    return records;
  }

  private async extractFromCsv(): Promise<RawRecord[]> {
    const csvPath = process.env.TICKETING_CSV_PATH;
    if (!csvPath) throw new Error('TICKETING_CSV_PATH must be set for CSV mode');

    const content = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    this.log.info({ path: csvPath, count: records.length }, 'CSV parsed');
    return records as RawRecord[];
  }

  async transform(raw: RawRecord[]): Promise<{
    supporters: NormalisedSupporter[];
    events: NormalisedEvent[];
    memberships: NormalisedMembership[];
  }> {
    const supporterMap = new Map<string, NormalisedSupporter>();
    const events: NormalisedEvent[] = [];
    const memberships: NormalisedMembership[] = [];
    let skipped = 0;

    for (const record of raw) {
      // Normalise column names before validation
      const normalisedRecord = normaliseColumns(record);

      const parsed = TicketingRecordSchema.safeParse(normalisedRecord);
      if (!parsed.success) {
        skipped++;
        this.log.warn(
          { errors: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`) },
          'Skipping invalid ticketing record',
        );
        continue;
      }
      const r: TicketingRecord = parsed.data;

      // ── Supporter (deduplicated by email) ──────
      if (!supporterMap.has(r.customer_email)) {
        supporterMap.set(r.customer_email, {
          email: r.customer_email,
          firstName: r.first_name,
          lastName: r.last_name,
          phone: r.phone,
          postcode: r.postcode,
          emailConsent: this.parseBoolean(r.marketing_opt_in),
          consentSource: 'ticketing_checkout',
          externalIds: { ticketing: r.ticket_id },
        });
      }

      // ── Event ──────────────────────────────────
      const fixtureDate = new Date(r.fixture_date);

      if (r.status === 'sold' || r.status === 'complimentary') {
        events.push({
          supporterEmail: r.customer_email,
          source: 'ticketing',
          eventType: 'ticket_purchased',
          eventDate: fixtureDate,
          value: r.ticket_price ?? 0,
          externalId: r.ticket_id,
          metadata: {
            ticketId: r.ticket_id,
            orderId: r.order_id,
            fixtureId: r.fixture_id,
            fixtureName: r.fixture_name,
            stand: r.stand,
            seatRow: r.seat_row,
            seatNumber: r.seat_number,
            isSeasonTicket: this.parseBoolean(r.is_season_ticket),
            season: r.season,
          },
        });
      } else if (r.status === 'refunded') {
        events.push({
          supporterEmail: r.customer_email,
          source: 'ticketing',
          eventType: 'ticket_refunded',
          eventDate: fixtureDate,
          value: -(r.ticket_price ?? 0),
          externalId: `refund-${r.ticket_id}`,
          metadata: { ticketId: r.ticket_id, orderId: r.order_id },
        });
      } else if (r.status === 'transferred') {
        events.push({
          supporterEmail: r.customer_email,
          source: 'ticketing',
          eventType: 'ticket_transferred',
          eventDate: fixtureDate,
          value: 0,
          externalId: `transfer-${r.ticket_id}`,
          metadata: { ticketId: r.ticket_id, orderId: r.order_id },
        });
      }

      // ── Season ticket membership ────────────────
      if (this.parseBoolean(r.is_season_ticket) && r.season) {
        const [startYear] = r.season.split('/');
        memberships.push({
          supporterEmail: r.customer_email,
          type: 'season_ticket',
          status: 'active',
          startDate: new Date(`${startYear}-07-01`),
          endDate: new Date(`${parseInt(startYear) + 1}-06-30`),
          pricePaid: r.ticket_price,
          externalId: `season-${r.customer_email}-${r.season}`,
        });
      }
    }

    if (skipped > 0) {
      this.log.warn({ skipped, total: raw.length }, 'Some records skipped — check column names or use TICKETING_FIELD_MAP');
    }

    return {
      supporters: Array.from(supporterMap.values()),
      events,
      memberships,
    };
  }

  private parseBoolean(val: boolean | string | undefined): boolean {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return ['true', '1', 'yes', 'y'].includes(val.toLowerCase());
    return false;
  }
}
