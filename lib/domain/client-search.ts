export type ClientSearchOption = {
  id: string;
  legalName: string;
  tradeName?: string | null;
  cpfCnpj?: string | null;
};

// A legacy freight may have only its historical customer name.
export type SelectedClient = Omit<ClientSearchOption, "id"> & { id: string | null };
