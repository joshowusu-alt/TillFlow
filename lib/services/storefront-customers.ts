import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { normalizeGhanaPhone } from '@/lib/storefront-phone';
import { deliverStorefrontOtp, type OtpDeliveryResult } from '@/lib/services/storefront-otp-delivery';

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_REQUEST_WINDOW_MS = 15 * 60 * 1000; // 15 min
const OTP_REQUEST_LIMIT = 4; // 4 OTPs per (business, phone) per 15 min

const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const SESSION_REFRESH_MS = 24 * 60 * 60 * 1000; // bump lastSeenAt at most once a day

export const STOREFRONT_SESSION_COOKIE = 'tillflow_customer_session';

export type StorefrontSessionCustomer = {
  id: string;
  businessId: string;
  phone: string;
  name: string | null;
  email: string | null;
};

function sessionCookieName(slug: string): string {
  return `${STOREFRONT_SESSION_COOKIE}_${slug}`;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateNumericCode(length: number): string {
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += randomInt(0, 10).toString();
  }
  return result;
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

async function getBusinessForSlug(slug: string) {
  if (!slug) return null;
  return prisma.business.findFirst({
    where: { storefrontSlug: slug, storefrontEnabled: true },
    select: {
      id: true,
      name: true,
      storefrontSlug: true,
    },
  });
}

export type RequestOtpInput = {
  slug: string;
  phone: string;
  email?: string | null;
};

export type RequestOtpResult =
  | { ok: true; channel: OtpDeliveryResult['channel']; delivered: boolean; devCode?: string }
  | { ok: false; error: string; retryAfterSeconds?: number };

export async function requestStorefrontOtp(input: RequestOtpInput): Promise<RequestOtpResult> {
  const business = await getBusinessForSlug(input.slug);
  if (!business) {
    return { ok: false, error: 'Store not found.' };
  }

  const phone = normalizeGhanaPhone(input.phone);
  if (!phone) {
    return { ok: false, error: 'Enter a valid Ghana mobile number.' };
  }

  const windowStart = new Date(Date.now() - OTP_REQUEST_WINDOW_MS);
  const recentRequests = await prisma.storefrontCustomerOtp.count({
    where: {
      businessId: business.id,
      phone,
      createdAt: { gte: windowStart },
    },
  });

  if (recentRequests >= OTP_REQUEST_LIMIT) {
    return {
      ok: false,
      error: 'Too many sign-in codes requested. Try again in a few minutes.',
      retryAfterSeconds: 15 * 60,
    };
  }

  const code = generateNumericCode(OTP_LENGTH);
  const codeHash = hashToken(code);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await prisma.storefrontCustomerOtp.create({
    data: {
      businessId: business.id,
      phone,
      codeHash,
      expiresAt,
    },
  });

  // Best-effort customer lookup so we can use their email channel if it's
  // recorded — but we never reveal whether the account already exists.
  const existing = await prisma.storefrontCustomer.findUnique({
    where: { businessId_phone: { businessId: business.id, phone } },
    select: { email: true },
  });

  const delivery = await deliverStorefrontOtp({
    storefrontName: business.name,
    phone,
    email: input.email?.trim() || existing?.email || null,
    code,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  });

  return {
    ok: true,
    channel: delivery.channel,
    delivered: delivery.delivered,
    devCode: delivery.devCode,
  };
}

export type VerifyOtpInput = {
  slug: string;
  phone: string;
  code: string;
  name?: string | null;
  email?: string | null;
  userAgent?: string | null;
};

export type VerifyOtpResult =
  | { ok: true; customer: StorefrontSessionCustomer; sessionToken: string; cookieName: string; expiresAt: Date; claimedOrders: number }
  | { ok: false; error: string };

export async function verifyStorefrontOtp(input: VerifyOtpInput): Promise<VerifyOtpResult> {
  const business = await getBusinessForSlug(input.slug);
  if (!business) {
    return { ok: false, error: 'Store not found.' };
  }

  const phone = normalizeGhanaPhone(input.phone);
  if (!phone) {
    return { ok: false, error: 'Enter a valid Ghana mobile number.' };
  }

  const submittedCode = String(input.code ?? '').trim();
  if (!/^\d{6}$/.test(submittedCode)) {
    return { ok: false, error: 'Enter the 6-digit code from your message.' };
  }

  const otp = await prisma.storefrontCustomerOtp.findFirst({
    where: {
      businessId: business.id,
      phone,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) {
    return { ok: false, error: 'Code expired. Request a new one.' };
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: 'Too many attempts on this code. Request a new one.' };
  }

  const submittedHash = hashToken(submittedCode);
  const matches = constantTimeEqual(submittedHash, otp.codeHash);

  if (!matches) {
    await prisma.storefrontCustomerOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    const remaining = Math.max(OTP_MAX_ATTEMPTS - (otp.attempts + 1), 0);
    return {
      ok: false,
      error:
        remaining > 0
          ? `That code didn't match. ${remaining} ${remaining === 1 ? 'try' : 'tries'} left.`
          : 'Too many wrong attempts. Request a new code.',
    };
  }

  await prisma.storefrontCustomerOtp.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });

  const trimmedName = input.name?.trim() || null;
  const trimmedEmail = input.email?.trim().toLowerCase() || null;

  const customer = await prisma.storefrontCustomer.upsert({
    where: { businessId_phone: { businessId: business.id, phone } },
    create: {
      businessId: business.id,
      phone,
      name: trimmedName,
      email: trimmedEmail,
      lastLoginAt: new Date(),
    },
    update: {
      lastLoginAt: new Date(),
      // Only fill blanks — never overwrite a name/email the customer set
      // before with a value typed in passing on the login form.
      name: trimmedName ? { set: trimmedName } : undefined,
      email: trimmedEmail ? { set: trimmedEmail } : undefined,
    },
    select: { id: true, businessId: true, phone: true, name: true, email: true },
  });

  // Claim any anonymous orders that match this phone — so "Buy again"
  // works on the customer's first session even for orders placed before
  // they had an account.
  // We also match the legacy MSISDN format (233XXXXXXXXX without the leading +)
  // for orders placed before the E.164 normalization fix.
  const phoneVariants = [phone];
  if (phone.startsWith('+')) phoneVariants.push(phone.slice(1));
  const claimResult = await prisma.onlineOrder.updateMany({
    where: {
      businessId: business.id,
      customerPhone: { in: phoneVariants },
      customerId: null,
    },
    data: { customerId: customer.id },
  });

  const sessionToken = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.storefrontCustomerSession.create({
    data: {
      customerId: customer.id,
      tokenHash,
      expiresAt,
      userAgent: input.userAgent?.slice(0, 200) ?? null,
    },
  });

  return {
    ok: true,
    customer,
    sessionToken,
    cookieName: sessionCookieName(input.slug),
    expiresAt,
    claimedOrders: claimResult.count,
  };
}

export function setStorefrontSessionCookie(slug: string, token: string, expiresAt: Date) {
  cookies().set(sessionCookieName(slug), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: `/shop/${slug}`,
    expires: expiresAt,
  });
}

export function clearStorefrontSessionCookie(slug: string) {
  try {
    cookies().delete(sessionCookieName(slug));
  } catch {
    // cookies().delete can throw outside a server-action / route-handler context.
  }
}

/**
 * Resolve the current logged-in customer from the per-slug cookie. Returns null
 * if there's no cookie, the cookie is unrecognised, or the session has expired.
 *
 * Side effect: bumps lastSeenAt at most once per SESSION_REFRESH_MS so we get
 * a meaningful "last seen" without writing on every page render.
 */
export async function getStorefrontSessionCustomer(slug: string): Promise<StorefrontSessionCustomer | null> {
  const token = cookies().get(sessionCookieName(slug))?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await prisma.storefrontCustomerSession.findUnique({
    where: { tokenHash },
    include: {
      customer: {
        select: { id: true, businessId: true, phone: true, name: true, email: true },
      },
    },
  });

  if (!session || !session.customer) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.storefrontCustomerSession.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Confirm the cookie corresponds to a customer of this slug — defends
  // against a token issued on storefront A being replayed on storefront B.
  const business = await getBusinessForSlug(slug);
  if (!business || session.customer.businessId !== business.id) return null;

  if (Date.now() - session.lastSeenAt.getTime() > SESSION_REFRESH_MS) {
    await prisma.storefrontCustomerSession
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }

  return session.customer;
}

export async function destroyStorefrontSession(slug: string) {
  const token = cookies().get(sessionCookieName(slug))?.value;
  if (token) {
    const tokenHash = hashToken(token);
    await prisma.storefrontCustomerSession.deleteMany({ where: { tokenHash } });
  }
  clearStorefrontSessionCookie(slug);
}

export async function getCustomerOrderHistory(customerId: string, phone: string, limit = 20) {
  // Also fetch unclaimed legacy orders by phone variants so that customers
  // with orders placed before the E.164 fix still see their history.
  const phoneVariants: string[] = [];
  if (phone) {
    phoneVariants.push(phone);
    if (phone.startsWith('+')) phoneVariants.push(phone.slice(1));
    else if (!phone.startsWith('+')) phoneVariants.push(`+${phone}`);
  }
  const orderSelect = {
    id: true,
    orderNumber: true,
    status: true,
    paymentStatus: true,
    fulfillmentStatus: true,
    totalPence: true,
    currency: true,
    createdAt: true,
    paidAt: true,
    publicToken: true,
    storeId: true,
    lines: {
      select: {
        id: true,
        productId: true,
        unitId: true,
        productName: true,
        unitName: true,
        imageUrl: true,
        qtyInUnit: true,
        unitPricePence: true,
        lineTotalPence: true,
      },
    },
  };
  const [claimed, unclaimed] = await Promise.all([
    prisma.onlineOrder.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: orderSelect,
    }),
    phoneVariants.length > 0
      ? prisma.onlineOrder.findMany({
          where: { customerId: null, customerPhone: { in: phoneVariants } },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: orderSelect,
        })
      : Promise.resolve([]),
  ]);
  // Merge, deduplicate, sort and cap
  const seen = new Set<string>();
  const all = [...claimed, ...unclaimed].filter((o) => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });
  all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return all.slice(0, limit);
}
