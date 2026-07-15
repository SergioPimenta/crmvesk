import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) {
    throw new Error('Envio de e-mail não configurado (EMAIL_HOST/EMAIL_USER/EMAIL_PASS ausentes).');
  }

  transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: Number(EMAIL_PORT) || 465,
    secure: String(EMAIL_PORT) === '465',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
  return transporter;
}

/**
 * Envia um e-mail via SMTP configurado (EMAIL_HOST/EMAIL_PORT/EMAIL_USER/EMAIL_PASS).
 * @param {Object} options
 * @param {string} options.to - Destinatário
 * @param {string} options.subject - Assunto
 * @param {string} [options.text] - Corpo em texto plano
 * @param {string} [options.html] - Corpo em HTML
 * @param {string} [options.fromName] - Nome de exibição do remetente
 * @param {Array<{filename: string, content: Buffer, contentType?: string}>} [options.attachments]
 */
export const sendMail = async ({ to, subject, text, html, fromName = 'VESK', attachments }) => {
  const info = await getTransporter().sendMail({
    from: `"${fromName}" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text: text || '',
    html,
    attachments,
  });
  return { success: true, messageId: info.messageId };
};
