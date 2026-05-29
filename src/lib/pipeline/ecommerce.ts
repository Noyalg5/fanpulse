// ─────────────────────────────────────────────
// FanPulse — E-commerce / Merchandise Adapter
//
// Handles online shop orders (WooCommerce, Shopify, or custom shop).
//
// Configure via:
//   ECOMMERCE_MODE=shopify|woocommerce|csv
//   ECOMMERCE_API_URL=https://yourshop.myshopify.com/admin/api/2024-01
//   ECOMMERCE_API_KEY=...
//   ECOMMERCE_CSV_PATH=/tmp/orders.csv
// ─────────────────────────────────────────────

import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import axios from 'axios';
import { z } from 'zod';
import { BaseAdapter } from './base';
import type { RawRecord, NormalisedSupporter, NormalisedEvent } from '@/types';

const OrderRecordSchema = z.object({
  order_id: z.string(),
  customer_email: z.string().email(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  order_date: z.string(),
  total_amount: z.coerce.number(),
  currency: z.string().default('GBP'),
  status: z.enum(['completed', 'refunded', 'cancelled', 'pending']).default('completed'),
  items: z.string().optional(), // JSON string of line items or comma-separated names
  postcode: z.string().optional(),
  marketing_opt_in: z.union([z.boolean(), z.string()]).optional(),
});

type OrderRecord = z.infer<typeof OrderRecordSchema>;

export class EcommerceAdapter extends BaseAdapter {
  readonly source = 'ecommerce' as const;

  async extract(): Promise<RawRecord[]> {
    const mode = process.env.ECOMMERCE_MODE ?? 'csv';
    if (mode === 'shopify') return this.extractFromShopify();
    if (mode === 'woocommerce') return this.extractFromWooCommerce();
    return this.extractFromCsv();
  }

  private async extractFromShopify(): Promise<RawRecord[]> {
    const apiUrl = process.env.ECOMMERCE_API_URL!;
    const apiKey = process.env.ECOMMERCE_API_KEY!;
    const records: RawRecord[] = [];
    let pageInfo: string | undefined;

    do {
      const response = await axios.get(`${apiUrl}/orders.json`, {
        headers: { 'X-Shopify-Access-Token': apiKey },
        params: {
          status: 'any',
          limit: 250,
          ...(pageInfo ? { page_info: pageInfo } : {}),
        },
      });

      const orders = (response.data as { orders: RawRecord[] }).orders;
      // Flatten Shopify order shape into our flat schema
      for (const o of orders) {
        const order = o as Record<string, unknown>;
        const customer = order.customer as Record<string, unknown> | undefined;
        records.push({
          order_id: String(order.id),
          customer_email: customer?.email ?? order.email,
          first_name: customer?.first_name,
          last_name: customer?.last_name,
          order_date: order.created_at,
          total_amount: order.total_price,
          currency: order.currency ?? 'GBP',
          status: order.financial_status === 'paid' ? 'completed' : order.financial_status,
          postcode: (order.shipping_address as Record<string, unknown> | undefined)?.zip,
        });
      }

      // Handle Shopify cursor-based pagination
      const linkHeader = response.headers.link as string | undefined;
      pageInfo = linkHeader?.match(/page_info=([^&>]+).*rel="next"/)?.[1];
    } while (pageInfo);

    return records;
  }

  private async extractFromWooCommerce(): Promise<RawRecord[]> {
    const apiUrl = process.env.ECOMMERCE_API_URL!;
    const apiKey = process.env.ECOMMERCE_API_KEY!;
    const response = await axios.get(`${apiUrl}/wp-json/wc/v3/orders`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: { per_page: 100 },
    });
    return response.data as RawRecord[];
  }

  private async extractFromCsv(): Promise<RawRecord[]> {
    const csvPath = process.env.ECOMMERCE_CSV_PATH;
    if (!csvPath) throw new Error('ECOMMERCE_CSV_PATH must be set for CSV mode');
    const content = fs.readFileSync(csvPath, 'utf-8');
    return parse(content, { columns: true, skip_empty_lines: true, trim: true }) as RawRecord[];
  }

  async transform(raw: RawRecord[]): Promise<{
    supporters: NormalisedSupporter[];
    events: NormalisedEvent[];
    memberships: never[];
  }> {
    const supporterMap = new Map<string, NormalisedSupporter>();
    const events: NormalisedEvent[] = [];

    for (const record of raw) {
      const parsed = OrderRecordSchema.safeParse(record);
      if (!parsed.success) {
        this.log.warn({ record, errors: parsed.error.errors }, 'Skipping invalid order record');
        continue;
      }
      const r: OrderRecord = parsed.data;

      if (!supporterMap.has(r.customer_email)) {
        supporterMap.set(r.customer_email, {
          email: r.customer_email,
          firstName: r.first_name,
          lastName: r.last_name,
          postcode: r.postcode,
          emailConsent: this.parseBoolean(r.marketing_opt_in),
          consentSource: 'ecommerce_checkout',
          externalIds: { ecommerce: r.order_id },
        });
      }

      if (r.status === 'completed') {
        events.push({
          supporterEmail: r.customer_email,
          source: 'ecommerce',
          eventType: 'merch_purchased',
          eventDate: new Date(r.order_date),
          value: r.total_amount,
          externalId: r.order_id,
          metadata: {
            orderId: r.order_id,
            currency: r.currency,
            items: r.items ?? null,
          },
        });
      } else if (r.status === 'refunded') {
        events.push({
          supporterEmail: r.customer_email,
          source: 'ecommerce',
          eventType: 'merch_purchased',
          eventDate: new Date(r.order_date),
          value: -r.total_amount,
          externalId: `refund-${r.order_id}`,
          metadata: { orderId: r.order_id, refunded: true },
        });
      }
    }

    return { supporters: Array.from(supporterMap.values()), events, memberships: [] };
  }

  private parseBoolean(val: boolean | string | undefined): boolean {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return ['true', '1', 'yes', 'y'].includes(val.toLowerCase());
    return false;
  }
}
