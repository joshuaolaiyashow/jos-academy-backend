import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly resend: Resend;
  private readonly defaultFrom: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY || '';
    if (!apiKey || apiKey === 'your_resend_api_key_here') {
      this.logger.warn('⚠️ RESEND_API_KEY is not configured in .env!');
    }
    this.resend = new Resend(apiKey);
    this.defaultFrom = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  }

  /**
   * Generic method to send an email using Resend
   */
  async sendEmail(options: SendEmailOptions) {
    try {
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
      const fromName = process.env.RESEND_FROM_NAME;
      const fromAddress = options.from || (fromName ? `${fromName} <${fromEmail}>` : fromEmail);

      const data = await this.resend.emails.send({
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      this.logger.log(`📧 Email sent successfully to ${options.to}. ID: ${data.data?.id}`);
      return data;
    } catch (error: any) {
      this.logger.error(`❌ Failed to send email to ${options.to}:`, error.message);
      throw error;
    }
  }

  /**send email verification link  */
  async sendEmailVerirfaction (email: string, name: string, verificationLink: string) {
        try {
          await this.sendEmail({
            to: email,
            subject: 'Verify Your Email Address - JOS Academy',
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px;">
                <h2 style="color: #111;">Welcome to JOS Academy, ${name}! 👋</h2>
                <p>Thank you for creating an account with us. Please click the button below to verify your email address and activate your account:</p>
                <div style="margin: 30px 0;">
                  <a href="${verificationLink}" style="background-color: #0070f3; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                    Verify Email Address
                  </a>
                </div>
                <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #0070f3; font-size: 14px;">${verificationLink}</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
                <p style="color: #888; font-size: 13px;">This verification link will expire in 24 hours.</p>
              </div>
            `,
          });
        } catch (emailError: any) {
        this.logger.error(`Failed to send verification email to ${email}:`, emailError?.message);
    }
  }

  /**
   * Send Welcome Email to a newly registered user
   */
  async sendWelcomeEmail(to: string, name: string) {
    const subject = 'Welcome to JOS Academy!';
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Welcome aboard, ${name}! 👋</h2>
        <p>Thank you for signing up for JOS Academy. We are thrilled to have you with us!</p>
        <p>If you have any questions, feel free to reply to this email.</p>
        <br />
        <p>Best regards,<br /><strong>The JOS Academy Team</strong></p>
      </div>
    `;
    return this.sendEmail({ to, subject, html });
  }

  /**
   * Send Password Reset Link Email
   */
  async sendPasswordResetLinkEmail(email: string, name: string, resetLink: string) {
    try {
      await this.sendEmail({
        to: email,
        subject: 'Reset Your Password - JOS Academy',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px;">
            <h2 style="color: #111;">Password Reset Request 🔐</h2>
            <p>Hello ${name},</p>
            <p>We received a request to reset your password for your JOS Academy account. Click the button below to set a new password:</p>
            <div style="margin: 30px 0;">
              <a href="${resetLink}" style="background-color: #0070f3; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #0070f3; font-size: 14px;">${resetLink}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
            <p style="color: #888; font-size: 13px;">This password reset link will expire in 1 hour. If you did not request a password reset, please ignore this email.</p>
          </div>
        `,
      });
    } catch (emailError: any) {
      this.logger.error(`Failed to send password reset email to ${email}:`, emailError?.message);
    }
  }

  /**
   * Send Verification OTP / Code Email
   */
  async sendVerificationEmail(to: string, code: string) {
    const subject = 'Your Verification Code - JOS Academy';
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Email Verification ✉️</h2>
        <p>Your verification code is:</p>
        <h1 style="background-color: #f4f4f5; padding: 10px 20px; display: inline-block; letter-spacing: 5px; color: #111;">
          ${code}
        </h1>
        <p>Please enter this code in the application to complete your verification.</p>
      </div>
    `;
    return this.sendEmail({ to, subject, html });
  }

  /**
   * Send Password Reset OTP Email
   */
  async sendPasswordResetOtpEmail(to: string, otp: string) {
    const subject = 'Reset Your Password OTP - JOS Academy';
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px;">
        <h2>Password Reset Request 🔐</h2>
        <p>You requested to reset your password. Use the 6-digit OTP code below:</p>
        <div style="margin: 20px 0;">
          <h1 style="background-color: #f4f4f5; padding: 12px 24px; display: inline-block; letter-spacing: 6px; color: #111; border-radius: 6px;">
            ${otp}
          </h1>
        </div>
        <p style="color: #666; font-size: 14px;">This code will expire in <strong>1 hour</strong>.</p>
        <p style="color: #888; font-size: 13px;">If you did not request a password reset, please ignore this email.</p>
      </div>
    `;
    return this.sendEmail({ to, subject, html });
  }
}