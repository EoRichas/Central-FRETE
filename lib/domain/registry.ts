export const CLIENT_CHANNELS = ['FROTA', 'CEGONHA', 'AMBOS'] as const;
export type ClientChannel = typeof CLIENT_CHANNELS[number];
export type RegistryAddress = { cep:string; street:string; number:string; complement:string; district:string; city:string; state:string };
export const EMPTY_ADDRESS: RegistryAddress = {cep:'',street:'',number:'',complement:'',district:'',city:'',state:''};
export function formatRegistryAddress(a:RegistryAddress) {
  return `${a.street}, ${a.number}${a.complement ? `, ${a.complement}` : ''} - ${a.district}, ${a.city}/${a.state}${a.cep ? `, CEP ${a.cep}` : ''}`;
}
export function addressFromForm(form:FormData): RegistryAddress | null {
  const address = Object.fromEntries(Object.keys(EMPTY_ADDRESS).map(key=>[key,String(form.get(key)??'').trim()])) as RegistryAddress;
  return Object.values(address).some(Boolean) ? address : null;
}
