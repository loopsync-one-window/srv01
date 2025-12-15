import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: configService.get<string>('SMTP_HOST'),
      port: configService.get<number>('SMTP_PORT'),
      secure: configService.get<boolean>('SMTP_SECURE'),
      auth: {
        user: configService.get<string>('SMTP_USER'),
        pass: configService.get<string>('SMTP_PASSWORD'),
      },
    });
  }

  async sendMail(to: string, subject: string, html: string) {
    const from = this.configService.get<string>('SMTP_FROM');

    await this.transporter.sendMail({
      from,
      to,
      subject,
      html,
    });
  }

  async sendMailFrom(from: string, to: string, subject: string, html: string) {
    await this.transporter.sendMail({
      from,
      to,
      subject,
      html,
    });
  }

  async sendOtpEmail(to: string, code: string) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Email Verification</h2>
        <p>Your verification code is:</p>
        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px;">
          ${code}
        </div>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this code, please ignore this email.</p>
      </div>
    `;

    await this.sendMail(to, 'Email Verification Code', html);
  }

  async sendPaymentSuccessEmail(
    to: string,
    planName: string,
    amount: number,
    isFreeTrial: boolean,
  ) {
    const formattedAmount = (amount / 100).toFixed(2);
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Payment Successful</h2>
        <p>Thank you for your subscription to LoopSync!</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Subscription Details</h3>
          <p><strong>Plan:</strong> ${planName}</p>
          <p><strong>Amount:</strong> ₹${formattedAmount}</p>
          <p><strong>Type:</strong> ${isFreeTrial ? 'Free Trial (7 days)' : 'Paid Subscription'}</p>
        </div>
        <p>Your subscription is now active and you can start using all the features of LoopSync.</p>
        <p>If you have any questions, feel free to contact our support team.</p>
        <p>Thank you for choosing LoopSync!</p>
      </div>
    `;

    await this.sendMail(to, 'Payment Successful - LoopSync Subscription', html);
  }

  async sendSubscriptionCancellationEmail(to: string, planName: string) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Subscription Cancelled</h2>
        <p>We're sorry to see you go. Your subscription to LoopSync has been cancelled.</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Cancelled Subscription</h3>
          <p><strong>Plan:</strong> ${planName}</p>
        </div>
        <p>We hope you enjoyed using LoopSync. If you have any feedback, we'd love to hear it.</p>
        <p>You can always resubscribe at any time by visiting our website.</p>
      </div>
    `;

    await this.sendMail(to, 'Subscription Cancelled - LoopSync', html);
  }

  async sendPaymentFailureEmail(
    to: string,
    amount: number,
    errorCode: string,
    errorDescription: string,
  ) {
    const formattedAmount = (amount / 100).toFixed(2);
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Payment Failed</h2>
        <p>We're sorry, but your payment for LoopSync subscription has failed.</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Payment Details</h3>
          <p><strong>Amount:</strong> ₹${formattedAmount}</p>
          <p><strong>Error Code:</strong> ${errorCode}</p>
          <p><strong>Error Description:</strong> ${errorDescription}</p>
        </div>
        <p>Please try again or contact our support team if you continue to experience issues.</p>
        <p>We apologize for any inconvenience this may have caused.</p>
      </div>
    `;

    await this.sendMail(to, 'Payment Failed - LoopSync Subscription', html);
  }
}
