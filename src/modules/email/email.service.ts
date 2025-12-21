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

  private getStyledTemplate(title: string, bodyContent: string): string {
    return `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff;">
        
        <!-- Header / Logo Text -->
        <div style="margin-bottom: 40px;">
           <span style="font-size: 24px; font-weight: 800; color: #000000; letter-spacing: -0.5px;">LOOPSYNC ONE WINDOW™</span>
        </div>

        <!-- Headline -->
        <h1 style="font-size: 32px; font-weight: 700; margin: 0 0 24px 0; color: #1a1a1a; letter-spacing: -0.5px;">${title}</h1>

        <!-- Content -->
        <div style="font-size: 16px; line-height: 1.6; color: #4a4a4a;">
          ${bodyContent}
        </div>

        <!-- Signature -->
        <div style="margin-top: 50px; font-size: 16px; color: #4a4a4a;">
          <p style="margin: 0;">So long, and thanks for all the fish,</p>
          <p style="margin: 4px 0 0 0; font-weight: 700; color: #000000;">The LoopSync Team</p>
        </div>

        <!-- Divider -->
        <hr style="border: 0; border-top: 1px solid #e5e5e5; margin: 40px 0 24px 0;" />

        <!-- Footer -->
        <div style="font-size: 13px; color: #999999; line-height: 1.5;">
          <p style="margin: 0 0 4px 0;">&copy; 2025 INTELLARIS PRIVATE LIMITED</p>
          <p style="margin: 0;">For questions contact <a href="mailto:support@loopsync.cloud" style="color: #999999; text-decoration: none;">support@loopsync.cloud</a></p>
        </div>

      </div>
    `;
  }

  async sendOtpEmail(to: string, code: string) {
    const content = `
      <p style="margin-bottom: 24px;">Hi,</p>
      <p style="margin-bottom: 24px;">Thank you for creating a LoopSync account. Please use the code below to validate your email address.</p>
      
      <div style="background-color: #fafafa; padding: 32px 0; text-align: center; margin: 32px 0; border-radius: 4px;">
        <span style="font-size: 32px; font-weight: 700; color: #000000; letter-spacing: 2px;">${code}</span>
      </div>

      <p style="margin-top: 32px;">If you did not create a new account, please ignore this email.</p>
    `;

    const html = this.getStyledTemplate('Validate your email', content);
    await this.sendMail(to, 'Validate your email', html);
  }

  async sendPaymentSuccessEmail(
    to: string,
    planName: string,
    amount: number,
    isFreeTrial: boolean,
  ) {
    const formattedAmount = (amount / 100).toFixed(2);
    const content = `
      <p style="margin-bottom: 24px;">Hi,</p>
      <p style="margin-bottom: 24px;">Thank you for your subscription to LoopSync One Window™.</p>
      
      <div style="background-color: #fafafa; padding: 24px; border-radius: 4px; margin: 32px 0;">
        <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #000;">Subscription Details</h3>
        <table style="width: 100%; border-collapse: collapse;">
           <tr>
             <td style="padding: 8px 0; color: #666;">Plan</td>
             <td style="padding: 8px 0; text-align: right; font-weight: 500; color: #000;">${planName}</td>
           </tr>
           <tr>
             <td style="padding: 8px 0; color: #666;">Amount</td>
             <td style="padding: 8px 0; text-align: right; font-weight: 500; color: #000;">₹${formattedAmount}</td>
           </tr>
           <tr>
             <td style="padding: 8px 0; color: #666;">Type</td>
             <td style="padding: 8px 0; text-align: right; font-weight: 500; color: #000;">${isFreeTrial ? 'Free Trial (7 days)' : 'Paid Subscription'}</td>
           </tr>
        </table>
      </div>

      <p>Your subscription is now active and you can start using all the features of LoopSync.</p>
    `;

    const html = this.getStyledTemplate('Payment Successful', content);
    await this.sendMail(to, 'Payment Successful - LoopSync Subscription', html);
  }

  async sendSubscriptionCancellationEmail(to: string, planName: string) {
    const content = `
      <p style="margin-bottom: 24px;">Hi,</p>
      <p>We're sorry to see you go. Your subscription to LoopSync has been cancelled.</p>
       
      <div style="background-color: #fafafa; padding: 24px; border-radius: 4px; margin: 32px 0;">
         <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #000;">Cancelled Plan</h3>
         <p style="margin: 0; color: #000; font-weight: 500;">${planName}</p>
      </div>

      <p>We hope you enjoyed using LoopSync. You can always resubscribe at any time.</p>
    `;

    const html = this.getStyledTemplate('Subscription Cancelled', content);
    await this.sendMail(to, 'Subscription Cancelled - LoopSync', html);
  }

  async sendPaymentFailureEmail(
    to: string,
    amount: number,
    errorCode: string,
    errorDescription: string,
  ) {
    const formattedAmount = (amount / 100).toFixed(2);
    const content = `
      <p style="margin-bottom: 24px;">Hi,</p>
      <p>We're sorry, but your payment for LoopSync subscription has failed.</p>
      
      <div style="background-color: #fafafa; padding: 24px; border-radius: 4px; margin: 32px 0;">
        <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #000;">Failure Details</h3>
        <table style="width: 100%; border-collapse: collapse;">
           <tr>
             <td style="padding: 8px 0; color: #666;">Amount Attempted</td>
             <td style="padding: 8px 0; text-align: right; font-weight: 500; color: #000;">₹${formattedAmount}</td>
           </tr>
           <tr>
             <td style="padding: 8px 0; color: #666;">Error Code</td>
             <td style="padding: 8px 0; text-align: right; font-weight: 500; color: #000;">${errorCode}</td>
           </tr>
           <tr>
             <td style="padding: 8px 0; color: #666;">Reason</td>
             <td style="padding: 8px 0; text-align: right; font-weight: 500; color: #000;">${errorDescription}</td>
           </tr>
        </table>
      </div>

      <p>Please try again or contact our support team if you continue to experience issues.</p>
    `;

    const html = this.getStyledTemplate('Payment Failed', content);
    await this.sendMail(to, 'Payment Failed - LoopSync Subscription', html);
  }
}
