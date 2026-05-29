import sgMail from '@sendgrid/mail';
import { prisma, getClubId } from '@/lib/db';
import { logger } from '@/lib/logger';

function buildEmailHtml(firstName: string | null, subject: string): string {
  const greeting = firstName ? `Dear ${firstName},` : 'Dear supporter,';
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,sans-serif;">
    <div style="background-color:#1a237e;padding:24px 32px;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:-0.5px;">
        Falkirk FC
      </h1>
      <p style="margin:4px 0 0;color:#c5cae9;font-size:13px;">Official Club Communication</p>
    </div>
    <div style="background-color:#ffffff;padding:32px;max-width:600px;margin:0 auto;">
      <p style="font-size:16px;color:#111827;margin:0 0 16px;">${greeting}</p>
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
        We miss you at the Falkirk Stadium. Here&rsquo;s what&rsquo;s coming up &mdash;
        exciting matches, events, and exclusive offers for supporters like you.
      </p>
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 32px;">
        Come back and be part of the Bairns family.
      </p>
      <div style="text-align:center;margin-bottom:32px;">
        <a href="https://www.falkirkfc.co.uk"
           style="background-color:#1a237e;color:#ffffff;padding:12px 28px;text-decoration:none;
                  border-radius:6px;font-weight:bold;font-size:14px;display:inline-block;">
          Visit Falkirk FC
        </a>
      </div>
    </div>
    <div style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;
                text-align:center;max-width:600px;margin:0 auto;">
      <p style="font-size:12px;color:#9ca3af;margin:0 0 4px;">
        You&rsquo;re receiving this because you opted in to communications from Falkirk FC.
      </p>
      <p style="font-size:12px;color:#9ca3af;margin:0 0 4px;">
        To unsubscribe, reply to this email with &ldquo;unsubscribe&rdquo; in the subject line.
      </p>
      <p style="font-size:12px;color:#9ca3af;margin:0;">
        &copy; ${year} Falkirk FC. All rights reserved.
      </p>
    </div>
  </body>
</html>`;
}

export async function sendPendingEmails(): Promise<{ sent: number; failed: number }> {
  const clubId = getClubId();
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.EMAIL_FROM;
  const fromName = process.env.EMAIL_FROM_NAME ?? 'Falkirk FC';

  if (!apiKey) {
    logger.warn('SENDGRID_API_KEY not configured — skipping email send');
    return { sent: 0, failed: 0 };
  }
  if (!fromEmail) {
    logger.warn('EMAIL_FROM not configured — skipping email send');
    return { sent: 0, failed: 0 };
  }

  sgMail.setApiKey(apiKey);

  // Filter pending recipients to this club via the campaign relation
  const pending = await prisma.campaignRecipient.findMany({
    where: {
      status: 'pending',
      campaign: { clubId },
    },
    include: {
      supporter: true,
      campaign: true,
    },
  });

  logger.info({ clubId, count: pending.length }, 'Sending pending campaign emails');

  let sent = 0;
  let failed = 0;

  for (const recipient of pending) {
    try {
      await sgMail.send({
        to: recipient.supporter.email,
        from: { email: fromEmail, name: fromName },
        subject: recipient.campaign.name,
        html: buildEmailHtml(recipient.supporter.firstName, recipient.campaign.name),
      });

      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: 'sent', sentAt: new Date() },
      });

      sent++;
    } catch (err) {
      logger.error(
        { err, recipientId: recipient.id, email: recipient.supporter.email },
        'Failed to send campaign email',
      );
      failed++;
    }
  }

  logger.info({ clubId, sent, failed }, 'Campaign email batch complete');
  return { sent, failed };
}
