import type {
  FinancialStatus,
  PaymentStatus,
  PaymentType,
  SaleFinancialResult,
} from "@/lib/domain/finance";

export type Role = "ADMIN" | "GERENCIA" | "VENDEDOR" | "FINANCEIRO";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export type CostPaymentStatus = "NAO_APLICAVEL" | "EM_ABERTO" | "PAGO";

export type SellerCommissionStatus = "EM_ABERTO" | "PAGO";

export type SellerCommissionRecord = {
  saleId: string | null;
  saleNumber: string | null;
  saleDate: string | null;
  clientName: string | null;
  sellerId: string | null;
  sellerName: string;
  pixDetails: string | null;
  competency: string;
  salesCount: number;
  totalSalesCents: number;
  commissionBasisPoints: number;
  commissionCents: number;
  status: SellerCommissionStatus;
  paidAt: string | null;
  paidByName: string | null;
};

export type CostRecord = {
  id: string;
  saleId: string;
  category: string;
  providerName: string | null;
  pixDetails: string | null;
  description: string | null;
  occurredOn: string | null;
  amountCents: number;
  confirmed: boolean;
  providerSlot: number | null;
  paymentStatus: CostPaymentStatus;
  paidAt: string | null;
  paidBy: string | null;
};

export type SaleAttachmentRecord = {
  id: string;
  saleId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  description: string | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  uploadedAt: string;
};

export type PaymentRecord = {
  id: string;
  saleId: string;
  installmentId: string | null;
  type: PaymentType;
  status: PaymentStatus;
  amountCents: number;
  occurredAt: string;
  paymentMethod: string;
  accountName: string | null;
  notes: string | null;
  reversedTransactionId: string | null;
  proofName: string | null;
  canReverse: boolean;
};

export type InstallmentRecord = {
  id: string;
  saleId: string;
  installmentNumber: number;
  installmentCount: number;
  dueDate: string;
  paymentMethod: string;
  expectedAmountCents: number;
  notes: string | null;
};

export type SaleRecord = {
  id: string;
  saleNumber: string;
  saleDate: string;
  competency: string;
  sellerId: string | null;
  sellerName: string;
  clientId: string | null;
  clientName: string | null;
  clientDocument: string | null;
  vehicle: string | null;
  plate: string | null;
  initialProviderName: string | null;
  origin: string;
  destination: string;
  pickupAddressSnapshot: string | null;
  deliveryAddressSnapshot: string | null;
  operationalDeadlineDays: number | null;
  originYardEntryDate: string | null;
  deliveryDeadline: string | null;
  financialDueDate: string;
  operationalStatus: string;
  legacyOperationalStatus: string | null;
  notes: string | null;
  freightAmountCents: number;
  commissionBasisPoints: number;
  costsPending: boolean;
  sourceRow: number | null;
  costs: CostRecord[];
  payments: PaymentRecord[];
  installments: InstallmentRecord[];
  attachments: SaleAttachmentRecord[];
  financial: SaleFinancialResult;
};

export type DashboardData = {
  competency: string;
  generatedAt: string;
  salesCount: number;
  freightAmountCents: number;
  operationalCommissionCents: number;
  totalReceivedCents: number;
  receivedInPeriodCents: number;
  advancesReceivedCents: number;
  totalBalanceCents: number;
  transportCostCents: number;
  marginCents: number;
  marginBasisPoints: number;
  marginIsProvisional: boolean;
  statuses: Record<
    FinancialStatus,
    { count: number; amountCents: number }
  >;
  customerCreditCents: number;
  bySeller: Array<{
    name: string;
    freightAmountCents: number;
    marginCents: number;
  }>;
  byDay: Array<{ date: string; freightAmountCents: number }>;
  upcoming: SaleRecord[];
  overdue: SaleRecord[];
};

export type ClientAddressRecord = {
  id: string;
  type: "EMPRESA" | "COLETA" | "ENTREGA";
  label: string | null;
  contactName: string | null;
  phone: string | null;
  cep: string | null;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  isPrimary: boolean;
};

export type ProviderRecord = {
  id: string;
  name: string;
  referenceName: string | null;
  yardAddress: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
};

export type ClientRecord = {
  id: string;
  type: "PF" | "PJ";
  legalName: string;
  tradeName: string | null;
  cpfCnpj: string | null;
  stateRegistration: string | null;
  notes: string | null;
  active: boolean;
  contacts: Array<{
    id: string;
    name: string;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    isPrimary: boolean;
  }>;
  addresses: ClientAddressRecord[];
  summary?: {
    salesCount: number;
    freightAmountCents: number;
    receivedCents: number;
    balanceCents: number;
    overdueCents: number;
  };
};
