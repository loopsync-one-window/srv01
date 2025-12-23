import { Injectable } from '@nestjs/common';
import { EmailService } from '../email/email.service';

export interface AcquisitionInquiryDto {
  name: string;
  email: string;
  phoneNumber: string;
  organization: string;
  role: string;
  buyerType: string;
  acquisitionScope: string;
  timeline: string;
  message: string;
  acknowledgement: boolean;
}

@Injectable()
export class AcquireService {
  constructor(private readonly emailService: EmailService) { }

  async handleInquiry(data: AcquisitionInquiryDto) {
    const { name, email } = data;
    const subject = 'LoopSync Acquisition Inquiry Received';

    // Minimalistic Template
    const htmlContent = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background-color: #ffffff; border: 1px solid #c4c4c4ff; border-radius: 20px; color: #000000; font-size: 13px; line-height: 1.6;">
        <p style="margin-top: 0;">Hello ${name},</p>

        <p>Thank you for reaching out regarding a potential acquisition of LoopSync.</p>

        <p>We've received your inquiry and our team is reviewing the details to ensure alignment with our strategic objectives.</p>

        <p>As part of our standard process, we require a signed <strong>Non-Disclosure Agreement (NDA)</strong> before sharing any confidential information, including the acquisition deck, financials, or technical details.</p>

        <p>If your inquiry aligns with our criteria, you will receive a follow-up email shortly with a secure NDA for review and execution.</p>

        <p>We appreciate your interest and look forward to continuing the conversation.</p>

        <p style="margin-bottom: 0; margin-top: 30px;">
          Regards,<br>
          <span style="font-weight: 600;">Strategic Desk</span><br>
          LoopSync One Window™<br>
          Intellaris Private Limited
        </p>
      </div>
    `;

    // Send to User
    await this.emailService.sendMail(email, subject, htmlContent);

    // Send to Internal Team (using same template for now, or could include form details)
    // The user requirement says "details will sent to both acquire@loopsync.cloud and user"
    // Usually internal email should have the form data.
    // "the details will sent to both ... and user provided email"
    // But the text provided is clearly for the user: "Hello {{Name}}... We’ve received your inquiry..."
    // If I send the SAME text to acquire@loopsync.cloud, it's weird but maybe acceptable as a notification.
    // However, usually "details sent to acquire@loopsync.cloud" means the FORM DATA.

    // I will send the formatted acknowledgement to the user.
    // And for the internal team, I will send the form data so they can actually review it.

    const internalHtml = `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>New Acquisition Inquiry</h2>
        <p><strong>Name:</strong> ${data.name}</p>
        <p><strong>Email:</strong> ${data.email}</p>
        <p><strong>Phone:</strong> ${data.phoneNumber}</p>
        <p><strong>Organization:</strong> ${data.organization}</p>
        <p><strong>Role:</strong> ${data.role}</p>
        <p><strong>Buyer Type:</strong> ${data.buyerType}</p>
        <p><strong>Scope:</strong> ${data.acquisitionScope}</p>
        <p><strong>Timeline:</strong> ${data.timeline}</p>
        <p><strong>Message:</strong><br>${data.message}</p>
        <p><strong>NDA Acknowledgement:</strong> ${data.acknowledgement ? 'Yes' : 'No'}</p>
      </div>
    `;

    await this.emailService.sendMail('acquire@loopsync.cloud', `New Acquisition Inquiry: ${data.name}`, internalHtml);
  }
}
