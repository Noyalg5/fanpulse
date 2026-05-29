// ─────────────────────────────────────────────
// FanPulse — Membership Adapter
//
// Handles FSS (Falkirk Supporters' Society), Junior Bairns, Patron,
// season ticket, and club membership data.
//
// Configure via environment variables:
//   MEMBERSHIP_MODE=api|csv
//   MEMBERSHIP_CSV_PATH=/path/to/export.csv
//
// Column name flexibility
// ───────────────────────
// The adapter normalises incoming column names before validation, so it works
// even if the membership system uses different names (e.g. "Email" vs "email").
//
// Built-in aliases cover the most common variations. For a system that uses
// completely different names, set MEMBERSHIP_FIELD_MAP to a JSON object that maps
// your system's column names to FanPulse's expected names:
//
//   MEMBERSHIP_FIELD_MAP='{"MemberRef":"member_id","EmailAddress":"email","ExpiryDate":"end_date"}'
//
// See docs/csv-templates/membership-import-template.csv for the full column reference.
// ─────────────────────────────────────────────

import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import axios from 'axios';
import { z } from 'zod';
import { BaseAdapter } from './base';
import type { RawRecord, NormalisedSupporter, NormalisedEvent, NormalisedMembership } from '@/types';

// ── Column alias map ──────────────────────────────────────────────────────────
// Maps FanPulse's canonical field names → all known column name variants from
// real membership systems. First match wins. Add new aliases as you encounter
// them; never remove existing ones.

const COLUMN_ALIASES: Record<string, string[]> = {
  member_id:        ['member_id', 'MemberID', 'MemberNo', 'MemberNumber',
                     'membership_id', 'MembershipID', 'id', 'ID',
                     'ref', 'Ref', 'member_ref', 'MemberRef',
                     'membership_number', 'MembershipNumber', 'account_id', 'AccountID'],

  email:            ['email', 'Email', 'EMAIL', 'EmailAddress', 'email_address',
                     'CustomerEmail', 'customer_email', 'contact_email',
                     'member_email', 'MemberEmail', 'account_email'],

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

  date_of_birth:    ['date_of_birth', 'DateOfBirth', 'dob', 'DOB',
                     'birth_date', 'BirthDate', 'birthday', 'Birthday'],

  membership_type:  ['membership_type', 'MembershipType', 'type', 'Type',
                     'product', 'Product', 'plan', 'Plan',
                     'membership_category', 'MembershipCategory',
                     'package', 'Package', 'scheme', 'Scheme',
                     'product_name', 'ProductName'],

  tier:             ['tier', 'Tier', 'level', 'Level', 'grade', 'Grade',
                     'category', 'Category', 'band', 'Band',
                     'membership_tier', 'MembershipTier', 'price_band', 'PriceBand'],

  status:           ['status', 'Status', 'membership_status', 'MembershipStatus',
                     'state', 'State', 'account_status', 'AccountStatus',
                     'member_status', 'MemberStatus'],

  start_date:       ['start_date', 'StartDate', 'start', 'Start',
                     'join_date', 'JoinDate', 'joined', 'Joined',
                     'purchase_date', 'PurchaseDate', 'activation_date', 'ActivationDate',
                     'valid_from', 'ValidFrom', 'from', 'From',
                     'issue_date', 'IssueDate', 'created_date', 'CreatedDate'],

  end_date:         ['end_date', 'EndDate', 'end', 'End',
                     'expiry', 'Expiry', 'expiry_date', 'ExpiryDate',
                     'expiration_date', 'ExpirationDate', 'expires', 'Expires',
                     'valid_to', 'ValidTo', 'to', 'To',
                     'renewal_due', 'membership_end'],

  renewal_date:     ['renewal_date', 'RenewalDate', 'next_renewal', 'NextRenewal',
                     'due_date', 'DueDate', 'renewal_due_date', 'RenewalDueDate',
                     'next_renewal_date', 'NextRenewalDate', 'auto_renew_date'],

  price_paid:       ['price_paid', 'PricePaid', 'price', 'Price',
                     'amount', 'Amount', 'cost', 'Cost',
                     'fee', 'Fee', 'total', 'Total',
                     'value', 'Value', 'membership_fee', 'MembershipFee',
                     'subscription_fee', 'annual_fee', 'AnnualFee'],

  marketing_opt_in: ['marketing_opt_in', 'MarketingOptIn', 'marketing_consent',
                     'MarketingConsent', 'opt_in', 'OptIn',
                     'email_consent', 'EmailConsent', 'email_opt_in',
                     'newsletter', 'Newsletter', 'allows_marketing',
                     'gdpr_email', 'GdprEmail'],

  sms_opt_in:       ['sms_opt_in', 'SmsOptIn', 'SMS_opt_in', 'sms_consent',
                     'SmsConsent', 'text_consent', 'TextConsent',
                     'sms_marketing', 'SmsMarketing', 'gdpr_sms', 'GdprSms',
                     'mobile_consent', 'MobileConsent'],
};

// ── Validation schema ─────────────────────────────────────────────────────────

const MembershipRecordSchema = z.object({
  member_id:        z.string(),
  email:            z.string().email(),
  first_name:       z.string().optional(),
  last_name:        z.string().optional(),
  phone:            z.string().optional(),
  postcode:         z.string().optional(),
  date_of_birth:    z.string().optional(),

  membership_type:  z.string(),
  tier:             z.string().optional(),
  status:           z.enum(['active', 'expired', 'cancelled', 'pending']),
  start_date:       z.string(),
  end_date:         z.string().optional(),
  renewal_date:     z.string().optional(),
  price_paid:       z.coerce.number().optional(),

  marketing_opt_in: z.union([z.boolean(), z.string()]).optional(),
  sms_opt_in:       z.union([z.boolean(), z.string()]).optional(),
});

type MembershipRecord = z.infer<typeof MembershipRecordSchema>;

// ── Column normalisation ──────────────────────────────────────────────────────

/**
 * Remaps raw column names to FanPulse's canonical names using:
 *   1. MEMBERSHIP_FIELD_MAP env var (highest priority, for full custom mapping)
 *   2. COLUMN_ALIASES (covers common variations automatically)
 *   3. Pass-through for any unrecognised columns (harmless)
 */
function normaliseColumns(raw: RawRecord): RawRecord {
  let customMap: Record<string, string> = {};
  const envMap = process.env.MEMBERSHIP_FIELD_MAP;
  if (envMap) {
    try {
      customMap = JSON.parse(envMap);
    } catch {
      // Malformed JSON — skip custom map, use aliases only
    }
  }

  const normalised: RawRecord = { ...raw };

  for (const [canonicalName, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (raw[canonicalName] !== undefined) continue;

    const customSourceKey = customMap[canonicalName];
    if (customSourceKey && raw[customSourceKey] !== undefined) {
      normalised[canonicalName] = raw[customSourceKey];
      continue;
    }

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

export class MembershipAdapter extends BaseAdapter {
  readonly source = 'membership' as const;

  async extract(): Promise<RawRecord[]> {
    const mode = process.env.MEMBERSHIP_MODE ?? 'csv';
    return mode === 'api' ? this.extractFromApi() : this.extractFromCsv();
  }

  private async extractFromApi(): Promise<RawRecord[]> {
    const baseUrl = process.env.MEMBERSHIP_API_URL;
    const apiKey = process.env.MEMBERSHIP_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error('MEMBERSHIP_API_URL and MEMBERSHIP_API_KEY must be set for API mode');
    }
    const response = await axios.get(`${baseUrl}/members`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return response.data.data as RawRecord[];
  }

  private async extractFromCsv(): Promise<RawRecord[]> {
    const csvPath = process.env.MEMBERSHIP_CSV_PATH;
    if (!csvPath) throw new Error('MEMBERSHIP_CSV_PATH must be set for CSV mode');
    const content = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
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
      const normalisedRecord = normaliseColumns(record);

      const parsed = MembershipRecordSchema.safeParse(normalisedRecord);
      if (!parsed.success) {
        skipped++;
        this.log.warn(
          { errors: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`) },
          'Skipping invalid membership record',
        );
        continue;
      }
      const r: MembershipRecord = parsed.data;

      // ── Supporter (deduplicated by email) ──────
      if (!supporterMap.has(r.email)) {
        supporterMap.set(r.email, {
          email: r.email,
          firstName: r.first_name,
          lastName: r.last_name,
          phone: r.phone,
          postcode: r.postcode,
          dateOfBirth: r.date_of_birth ? new Date(r.date_of_birth) : undefined,
          emailConsent: this.parseBoolean(r.marketing_opt_in),
          smsConsent: this.parseBoolean(r.sms_opt_in),
          consentSource: 'membership_form',
          externalIds: { membership: r.member_id },
        });
      }

      // ── Membership event ────────────────────────
      const eventType = r.status === 'active'
        ? (this.isRenewal(r) ? 'membership_renewed' : 'membership_joined')
        : r.status === 'cancelled'
          ? 'membership_cancelled'
          : 'membership_lapsed';

      events.push({
        supporterEmail: r.email,
        source: 'membership',
        eventType,
        eventDate: new Date(r.start_date),
        value: r.price_paid ?? 0,
        externalId: `membership-event-${r.member_id}`,
        metadata: {
          memberId: r.member_id,
          membershipType: r.membership_type,
          tier: r.tier,
          status: r.status,
        },
      });

      // ── Membership record ───────────────────────
      memberships.push({
        supporterEmail: r.email,
        type: r.membership_type,
        status: r.status,
        tier: r.tier,
        startDate: new Date(r.start_date),
        endDate: r.end_date ? new Date(r.end_date) : undefined,
        renewalDate: r.renewal_date ? new Date(r.renewal_date) : undefined,
        pricePaid: r.price_paid,
        externalId: r.member_id,
      });
    }

    if (skipped > 0) {
      this.log.warn(
        { skipped, total: raw.length },
        'Some records skipped — check column names or use MEMBERSHIP_FIELD_MAP',
      );
    }

    return { supporters: Array.from(supporterMap.values()), events, memberships };
  }

  private parseBoolean(val: boolean | string | undefined): boolean {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return ['true', '1', 'yes', 'y'].includes(val.toLowerCase());
    return false;
  }

  private isRenewal(r: MembershipRecord): boolean {
    // Treat as renewal if the start date is in a year where the supporter
    // plausibly had a prior membership (i.e. not a first-year join).
    const start = new Date(r.start_date);
    return start.getFullYear() > new Date().getFullYear() - 1;
  }
}
