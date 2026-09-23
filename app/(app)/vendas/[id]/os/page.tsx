import { ServiceOrderScreen } from '@/components/service-order-screen';
export default async function Page({params}: {params:Promise<{id:string}>}) {
  const {id}=await params;
  return <ServiceOrderScreen id={id} />;
}
