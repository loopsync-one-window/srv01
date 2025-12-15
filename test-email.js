const nodemailer = require('nodemailer');

// SMTP configuration from .env
const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.in',
  port: 465,
  secure: true,
  auth: {
    user: 'noreply@loopsync.cloud',
    pass: 'tAx88kAVQp7S'
  }
});

// Test email
const mailOptions = {
  from: '"LoopSync Cloud Console" <noreply@loopsync.cloud>',
  to: 'test@example.com',
  subject: 'Test Email from LoopSync',
  html: '<h1>Test Email</h1><p>This is a test email from LoopSync.</p>'
};

// Send email
transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    console.log('Error sending email:', error);
  } else {
    console.log('Email sent successfully:', info.response);
  }
});