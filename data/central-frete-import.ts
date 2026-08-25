type ImportedProvider = {
  id: string;
  name: string;
};

type ImportedCost = readonly [
  category: string,
  amountCents: number,
  description: string,
  sourceColumn: string,
];

type ImportedSale = {
  id: string;
  importKey: string;
  sourceRow: number;
  saleNumber: string;
  saleDate: string;
  competency: string;
  sellerName: string;
  vehicle: string;
  plate: string;
  initialProviderId: string;
  initialProviderName: string;
  origin: string;
  destination: string;
  dueDate: string;
  operationalStatus: string;
  legacyOperationalStatus: string;
  freightAmountCents: number;
  commissionBasisPoints: number;
  paymentMethod: string;
  costs: ImportedCost[];
  advance: {
    amountCents: number;
    occurredAt: string;
    notes: string;
  };
};

// Dados reais de vendedores, placas e valores nunca devem ser versionados.
export const CENTRAL_FRETE_IMPORT = {
  importKey: "central-frete-sem-planilha",
  workbookName: "",
  sourceHash: "",
  sourceSheet: "",
  validRows: 0,
  ignoredTemplateRows: 0,
  warningRows: 0,
  errorRows: 0,
  expectedTotals: {
    freightAmountCents: 0,
    transportCostCents: 0,
    marginCents: 0,
    marginBasisPoints: 0,
    totalReceivedCents: 0,
    totalBalanceCents: 0,
    paidCount: 0,
    paidAmountCents: 0,
    overdueCount: 0,
    overdueBalanceCents: 0,
  },
  warnings: ["Nenhuma planilha operacional está incluída no repositório público."],
  providers: [] as ImportedProvider[],
  sales: [] as ImportedSale[],
} as const;
