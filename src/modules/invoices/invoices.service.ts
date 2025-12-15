import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type InvoiceStatus = 'PAID' | 'FAILED' | 'PENDING';
type InvoiceType = 'SINGLE_PURCHASE' | 'SUBSCRIPTION' | 'REFUND';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async listInvoices(params: {
    userId?: string;
    email?: string;
    page?: number;
    limit?: number;
    status?: InvoiceStatus;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 10;
    let userId = params.userId || '';
    if (!userId && params.email) {
      const user = await (this.prisma as any).user.findUnique({
        where: { email: params.email },
      });
      userId = user?.id || '';
    }
    if (!userId) {
      return { success: true, meta: { page, limit, total: 0 }, invoices: [] };
    }
    const where: any = { userId };
    if (params.status) where.status = params.status;
    const total = await (this.prisma as any).invoice.count({ where });
    const items = await (this.prisma as any).invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      success: true,
      meta: { page, limit, total },
      invoices: items.map((i: any) => this.toUiRow(i)),
    };
  }

  async createInvoice(data: {
    userId: string;
    type: InvoiceType;
    amount: number;
    currency: string;
    paymentProvider?: string;
    paymentReferenceId?: string;
    status?: InvoiceStatus;
  }) {
    const invoiceNumber = this.generateInvoiceNumber();
    const status: InvoiceStatus = data.status || 'PENDING';
    const created = await (this.prisma as any).invoice.create({
      data: {
        userId: data.userId,
        type: data.type,
        amount: data.amount,
        currency: data.currency,
        paymentProvider: data.paymentProvider,
        paymentReferenceId: data.paymentReferenceId,
        status,
        invoiceNumber,
      },
    });
    return { success: true, invoice: this.toUiRow(created) };
  }

  async getByInvoiceNumber(invoiceNumber: string, userId?: string) {
    const where: any = { invoiceNumber };
    if (userId) where.userId = userId;
    const invoice = await (this.prisma as any).invoice.findFirst({
      where,
    });
    if (!invoice) {
      return { success: false, error: 'NOT_FOUND' };
    }
    return { success: true, invoice: this.toUiRow(invoice) };
  }

  private toUiRow(i: any) {
    const date = this.formatDate(i.createdAt);
    return {
      invoiceNumber: i.invoiceNumber,
      date,
      type: this.typeToLabel(i.type),
      amount: this.formatINR(i.amount),
      status: this.statusToLabel(i.status),
    };
  }

  private typeToLabel(t: string) {
    if (t === 'SUBSCRIPTION') return 'Subscription';
    if (t === 'REFUND') return 'Refund';
    return 'Single Purchase';
  }

  private statusToLabel(s: string) {
    if (s === 'PAID') return 'Paid';
    if (s === 'FAILED') return 'Failed';
    return 'Pending';
  }

  private formatINR(paise: number) {
    const rupees = paise / 100;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(rupees);
  }

  private formatDate(d: Date | string) {
    const dt = typeof d === 'string' ? new Date(d) : d;
    return dt.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  private generateInvoiceNumber() {
    const part = () =>
      String(Math.floor(100 + Math.random() * 900)).padStart(3, '0');
    return `#${part()}-${part()}-${part()}-${part()}`;
  }
}
