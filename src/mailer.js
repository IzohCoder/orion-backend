const sgMail = require('@sendgrid/mail');
require('dotenv').config();

const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) {
  sgMail.setApiKey(apiKey);
} else {
  console.warn("WARNING: SENDGRID_API_KEY is not defined in the environment.");
}

const emailFrom = process.env.EMAIL_FROM || 'isaacnjuguna15125@gmail.com';

async function sendEmail(to, subject, htmlContent) {
  if (!apiKey) {
    console.log(`[Mock Email Send] To: ${to}, Subject: ${subject}\nContent: ${htmlContent}`);
    return;
  }

  const msg = {
    to,
    from: emailFrom,
    subject,
    html: htmlContent,
  };

  try {
    await sgMail.send(msg);
    console.log(`[SendGrid] Email sent successfully to ${to}`);
  } catch (error) {
    console.error(`[SendGrid] Failed to send email to ${to}:`, error);
    if (error.response) {
      console.error(error.response.body);
    }
    throw error;
  }
}

module.exports = { sendEmail };
