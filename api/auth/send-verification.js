import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

const MIN_RESEND_INTERVAL_MS = 60 * 1000;
const DEFAULT_APP_URL = 'https://knchs-labtrack.vercel.app';

class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function getRequiredEnvironment() {
  const serviceAccountValue = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON
    || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 0);
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const emailFrom = process.env.EMAIL_FROM;

  if (!serviceAccountValue || !smtpHost || !smtpPort || !smtpUser || !smtpPassword || !emailFrom) {
    throw new HttpError(503, 'email-delivery-not-configured', 'Custom verification email delivery is not configured.');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountValue);
  } catch {
    throw new HttpError(503, 'invalid-service-account', 'The Firebase service account setting is invalid.');
  }

  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new HttpError(503, 'invalid-service-account', 'The Firebase service account setting is incomplete.');
  }

  let appUrl;
  try {
    appUrl = new URL(process.env.LABTRACK_APP_URL || DEFAULT_APP_URL);
  } catch {
    throw new HttpError(503, 'invalid-app-url', 'The LabTrack app URL setting is invalid.');
  }

  if (appUrl.protocol !== 'https:') {
    throw new HttpError(503, 'invalid-app-url', 'The LabTrack app URL must use HTTPS.');
  }

  return {
    serviceAccount,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPassword,
    smtpSecure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === 'true'
      : smtpPort === 465,
    emailFrom,
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
    appOrigin: appUrl.origin,
  };
}

function getAdminApp(serviceAccount) {
  const existing = getApps().find((app) => app.name === 'labtrack-verification-mailer');
  if (existing) return existing;
  return initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  }, 'labtrack-verification-mailer');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function makeLabTrackActionUrl(generatedLink, appOrigin) {
  let generatedUrl = new URL(generatedLink);
  const wrappedLink = generatedUrl.searchParams.get('link');
  if (!generatedUrl.searchParams.has('oobCode') && wrappedLink) {
    generatedUrl = new URL(wrappedLink);
  }

  if (generatedUrl.searchParams.get('mode') !== 'verifyEmail' || !generatedUrl.searchParams.get('oobCode')) {
    throw new Error('Firebase did not return a valid email verification action link.');
  }

  const actionUrl = new URL('/auth/action', appOrigin);
  for (const key of ['mode', 'oobCode', 'apiKey', 'continueUrl', 'lang']) {
    const value = generatedUrl.searchParams.get(key);
    if (value) actionUrl.searchParams.set(key, value);
  }
  return actionUrl.toString();
}

async function reserveResendSlot(db, uid) {
  const ref = db.collection('_privateAuthEmailLimits').doc(uid);
  const now = Date.now();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const previousSend = snapshot.get('lastVerificationEmailAt');
    const lastSentAt = previousSend?.toMillis?.() || 0;
    const remainingMs = MIN_RESEND_INTERVAL_MS - (now - lastSentAt);
    if (remainingMs > 0) {
      throw new HttpError(
        429,
        'verification-resend-too-soon',
        'Please wait before requesting another verification email.',
        { retryAfterSeconds: Math.ceil(remainingMs / 1000) },
      );
    }
    transaction.set(ref, { lastVerificationEmailAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ code: 'method-not-allowed', message: 'Use POST for this endpoint.' });
  }

  try {
    const config = getRequiredEnvironment();
    const match = String(request.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (!match) throw new HttpError(401, 'missing-auth-token', 'Sign in to request a verification email.');

    const app = getAdminApp(config.serviceAccount);
    const adminAuth = getAuth(app);
    const decodedToken = await adminAuth.verifyIdToken(match[1], true);
    const user = await adminAuth.getUser(decodedToken.uid);

    if (user.disabled) throw new HttpError(403, 'account-disabled', 'This account is disabled.');
    if (!user.email) throw new HttpError(400, 'email-missing', 'This account does not have an email address.');
    if (user.emailVerified) {
      return response.status(200).json({ sent: false, alreadyVerified: true, delivery: 'labtrack' });
    }

    const db = getFirestore(app);
    await reserveResendSlot(db, user.uid);

    const continueUrl = new URL('/verify-email', config.appOrigin).toString();
    const generatedLink = await adminAuth.generateEmailVerificationLink(user.email, {
      url: continueUrl,
      handleCodeInApp: false,
    });
    const actionUrl = makeLabTrackActionUrl(generatedLink, config.appOrigin);
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
      auth: { user: config.smtpUser, pass: config.smtpPassword },
    });
    const displayName = user.displayName ? ' ' + escapeHtml(user.displayName) : '';

    await transporter.sendMail({
      from: config.emailFrom,
      to: user.email,
      replyTo: config.replyTo,
      subject: 'Verify your email for LabTrack',
      text: 'Hello' + (user.displayName ? ' ' + user.displayName : '') + ',\n\n'
        + 'Please verify your email address for LabTrack by opening this link:\n'
        + actionUrl + '\n\n'
        + 'If you did not create a LabTrack account, you can ignore this email.\n\nLabTrack',
      html: '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6">'
        + '<p>Hello' + displayName + ',</p>'
        + '<p>Please verify your email address to finish creating your LabTrack account.</p>'
        + '<p><a href="' + escapeHtml(actionUrl) + '" style="display:inline-block;padding:12px 18px;'
        + 'background:#a30f17;color:#ffffff;text-decoration:none;border-radius:8px">Verify your email</a></p>'
        + '<p>If you did not create a LabTrack account, you can ignore this email.</p>'
        + '<p>LabTrack</p></body></html>',
    });

    return response.status(200).json({ sent: true, delivery: 'labtrack' });
  } catch (error) {
    if (error instanceof HttpError) {
      return response.status(error.status).json({ code: error.code, message: error.message, ...error.extra });
    }
    console.error('Custom LabTrack verification email failed:', error?.code || error?.message || 'unknown error');
    return response.status(500).json({
      code: 'verification-email-send-failed',
      message: 'LabTrack could not send the verification email. Please try again later.',
    });
  }
}
