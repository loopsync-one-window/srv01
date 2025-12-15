import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  Req,
  Headers,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import PDFDocument from 'pdfkit';

import { InvoicesService } from './invoices.service';
import { UsersService } from '../users/users.service';

const INTERNAL_KEY = 'loopsync-system-00AC256b7A';

@ApiTags('invoices')
@Controller('api/v1/billing/invoices')
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly usersService: UsersService,
  ) {}

  // =========================
  // AUTH – LIST INVOICES
  // =========================
  @UseGuards(AuthGuard('jwt'))
  @Get()
  async listInvoicesAuth(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: 'PAID' | 'FAILED' | 'PENDING',
  ) {
    return this.invoicesService.listInvoices({
      userId: req.user.id,
      page: Number(page),
      limit: Number(limit),
      status,
    });
  }

  // =========================
  // INTERNAL – LIST INVOICES
  // =========================
  @Get('internal')
  async listInvoicesInternal(
    @Headers('x-pepron-key') key: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: 'PAID' | 'FAILED' | 'PENDING',
    @Query('email') email?: string,
    @Query('userId') userId?: string,
  ) {
    if (key !== INTERNAL_KEY) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    return this.invoicesService.listInvoices({
      userId,
      email,
      page: Number(page),
      limit: Number(limit),
      status,
    });
  }

  // =========================
  // AUTH – CREATE INVOICE
  // =========================
  @UseGuards(AuthGuard('jwt'))
  @Post()
  async createInvoiceAuth(
    @Req() req: any,
    @Body()
    body: {
      type: 'SINGLE_PURCHASE' | 'SUBSCRIPTION' | 'REFUND';
      amount: number;
      currency: 'INR';
      paymentProvider?: string;
      paymentReferenceId?: string;
      status?: 'PAID' | 'FAILED' | 'PENDING';
    },
  ) {
    return this.invoicesService.createInvoice({
      userId: req.user.id,
      ...body,
    });
  }

  // =========================
  // AUTH – GET INVOICE
  // =========================
  @UseGuards(AuthGuard('jwt'))
  @Get(':invoiceNumber')
  async getInvoiceAuth(
    @Req() req: any,
    @Param('invoiceNumber') invoiceNumber: string,
  ) {
    return this.invoicesService.getByInvoiceNumber(
      invoiceNumber,
      req.user.id,
    );
  }

  // =========================
  // INTERNAL – GET INVOICE
  // =========================
  @Get('internal/:invoiceNumber')
  async getInvoiceInternal(
    @Headers('x-pepron-key') key: string,
    @Param('invoiceNumber') invoiceNumber: string,
    @Query('email') email?: string,
    @Query('userId') userId?: string,
  ) {
    if (key !== INTERNAL_KEY) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    let resolvedUserId = userId;

    if (!resolvedUserId && email) {
      const user = await this.usersService.findOneByEmail(email);
      resolvedUserId = user?.id;
    }

    return this.invoicesService.getByInvoiceNumber(
      invoiceNumber,
      resolvedUserId,
    );
  }

  // =========================
  // AUTH – DOWNLOAD PDF
  // =========================
  @UseGuards(AuthGuard('jwt'))
  @Get(':invoiceNumber/download')
  async downloadInvoiceAuth(
    @Req() req: any,
    @Param('invoiceNumber') invoiceNumber: string,
    @Res() res: Response,
  ) {
    const found = await this.invoicesService.getByInvoiceNumber(
      invoiceNumber,
      req.user.id,
    );

    if (!found?.success) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    this.streamInvoicePdf(res, invoiceNumber, found.invoice);
  }

  // =========================
  // INTERNAL – DOWNLOAD PDF
  // =========================
  @Get('internal/:invoiceNumber/download')
  async downloadInvoiceInternal(
    @Headers('x-pepron-key') key: string,
    @Param('invoiceNumber') invoiceNumber: string,
    @Res() res: Response,
    @Query('email') email?: string,
    @Query('userId') userId?: string,
  ) {
    if (key !== INTERNAL_KEY) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    let resolvedUserId = userId;

    if (!resolvedUserId && email) {
      const user = await this.usersService.findOneByEmail(email);
      resolvedUserId = user?.id;
    }

    const found = await this.invoicesService.getByInvoiceNumber(
      invoiceNumber,
      resolvedUserId,
    );

    if (!found?.success) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    this.streamInvoicePdf(res, invoiceNumber, found.invoice);
  }

  // =========================
  // PDF HELPER (REUSED)
  // =========================
  private streamInvoicePdf(
    res: Response,
    invoiceNumber: string,
    invoice: any,
  ) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${invoiceNumber}.pdf"`,
    );

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);

    doc.fontSize(18).text(`Invoice #${invoiceNumber}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Amount: ₹${invoice.amount}`);
    doc.text(`Status: ${invoice.status}`);
    doc.text(`Type: ${invoice.type}`);
    doc.text(`Date: ${new Date(invoice.createdAt).toDateString()}`);

    doc.end();
  }
}
