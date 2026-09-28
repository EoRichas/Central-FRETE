// Public CEP coordinates and road distance. No straight-line approximation.
// Cache successful lookups and coalesce requests to reduce external traffic.
import { ApiError } from './d1';
type Point = { longitude: number; latitude: number };
type CepLocation = { address: string; point: Point | null };
const cache = new Map<string, { expires: number; value: CepLocation }>();
const pending = new Map<string, Promise<CepLocation>>();

export function cepCoordinates(value: unknown): Point | null {
  if (!value || typeof value !== 'object') return null;
  const c=value as Record<string,unknown>;
  if (c.longitude == null || c.latitude == null || c.longitude === '' || c.latitude === '') return null;
  const longitude=Number(c.longitude), latitude=Number(c.latitude);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -74 || longitude > -34 || latitude < -34 || latitude > 6) return null;
  return {longitude,latitude};
}
export async function locateCep(cep: string): Promise<CepLocation> {
  if (!/^\d{8}$/.test(cep)) throw new ApiError(400,'Informe um CEP de 8 dígitos.');
  const saved=cache.get(cep);
  if (saved && saved.expires>Date.now()) return saved.value;
  const active=pending.get(cep); if(active) return active;
  const task=(async()=>{
    const response=await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`,{signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new ApiError(response.status===404?404:503,'Não foi possível localizar o CEP. Confira o número ou informe a distância manualmente.');
    const data=await response.json();
    if(typeof data.city!=='string' || typeof data.state!=='string') throw new ApiError(503,'Endereço do CEP indisponível. Informe a distância manualmente.');
    const value={address:[data.street,data.neighborhood,data.city,data.state].filter(Boolean).join(', '),point:cepCoordinates(data.location?.coordinates)};
    if(cache.size>=1000) cache.delete(cache.keys().next().value!);
    cache.set(cep,{expires:Date.now()+86400000,value});
    return value;
  })();
  pending.set(cep,task);
  try {return await task;} finally {pending.delete(cep);}
}
const routes=new Map<string,{expires:number;meters:number}>();
const routePending=new Map<string,Promise<number>>();
export async function roadDistance(origin: Point, destination: Point): Promise<number> {
  const base=(process.env.OSRM_BASE_URL || 'https://router.project-osrm.org').replace(/\/$/,'');
  const coordinates=`${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const key=`${base}/${coordinates}`;
  const saved=routes.get(key);if(saved && saved.expires>Date.now()) return saved.meters;
  const active=routePending.get(key);if(active) return active;
  const task=(async()=>{
    const response=await fetch(`${base}/route/v1/driving/${coordinates}?overview=false&alternatives=false&steps=false`,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Central-Frete/1.0'}});
    if(!response.ok) throw new ApiError(503,'Serviço de rotas indisponível. Informe a distância manualmente.');
    const data=await response.json();
    const distance=data.routes?.[0]?.distance;
    if(data.code!=='Ok' || typeof distance!=='number' || !Number.isFinite(distance) || distance<0 || distance>100000000) throw new ApiError(503,'Rota não encontrada. Informe a distância manualmente.');
    const meters=Math.round(distance);
    if(routes.size>=1000) routes.delete(routes.keys().next().value!);
    routes.set(key,{expires:Date.now()+86400000,meters});return meters;
  })();
  routePending.set(key,task);
  try{return await task;}finally{routePending.delete(key);}
}
