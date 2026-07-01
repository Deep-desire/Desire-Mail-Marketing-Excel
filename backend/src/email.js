const { EmailClient } = require('@azure/communication-email');
const nodemailer = require('nodemailer');

const AZURE_COMMUNICATION_CONNECTION_STRING = process.env.AZURE_COMMUNICATION_CONNECTION_STRING || '';
const AZURE_COMMUNICATION_FROM_EMAIL = process.env.AZURE_COMMUNICATION_FROM_EMAIL || 'donotreply@yourdomain.com';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

// Initialize Azure Communication Services Email Client
const isAzureConfigured = 
  AZURE_COMMUNICATION_CONNECTION_STRING && 
  AZURE_COMMUNICATION_CONNECTION_STRING.trim() !== '' &&
  !AZURE_COMMUNICATION_CONNECTION_STRING.includes('your-resource');

const azureEmailClient = isAzureConfigured ? new EmailClient(AZURE_COMMUNICATION_CONNECTION_STRING) : null;

// Initialize NodeMailer SMTP Transporter with connection pooling
const smtpTransporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false,
  pool: true,           // Reuse TCP connections across emails
  maxConnections: 5,    // 5 concurrent SMTP connections
  maxMessages: 100,     // Recycle connection after 100 messages
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

async function sendViaAzure(options) {
  if (!azureEmailClient) {
    throw new Error('Azure Communication Services client is not initialized');
  }
  const emailMessage = {
    senderAddress: AZURE_COMMUNICATION_FROM_EMAIL,
    content: {
      subject: options.subject,
      plainText: options.text,
      html: options.html,
    },
    recipients: {
      to: [{ address: options.to }],
    },
  };

  const poller = await azureEmailClient.beginSend(emailMessage);
  const result = await poller.pollUntilDone();
  return result.messageId || result.id || 'unknown';
}

async function sendViaSMTP(options) {
  const fromAddress = SMTP_USER ? `Desire Mail <${SMTP_USER}>` : AZURE_COMMUNICATION_FROM_EMAIL;
  const info = await smtpTransporter.sendMail({
    from: fromAddress,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
  return info.messageId || 'unknown';
}

async function sendEmail(options) {
  if (isAzureConfigured) {
    try {
      const messageId = await sendViaAzure(options);
      console.log(`Email sent via Azure Communication Services to ${options.to}: ${messageId}`);
      return { messageId, provider: 'azure' };
    } catch (azureError) {
      console.warn(
        `Azure Communication Services failed for ${options.to}: ${azureError.message}. Falling back to SMTP.`,
      );
    }
  }

  try {
    const messageId = await sendViaSMTP(options);
    console.log(`Email sent via SMTP to ${options.to}: ${messageId}`);
    return { messageId, provider: 'smtp' };
  } catch (smtpError) {
    console.error(
      `SMTP failed for ${options.to}: ${smtpError.message}`,
    );
    throw new Error(
      `All email providers failed. SMTP Error: ${smtpError.message}`,
    );
  }
}

module.exports = { sendEmail };
