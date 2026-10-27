import { requireAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AdminPanel } from './panel';
export const dynamic='force-dynamic';
export default async function Admin(){let principal;try{principal=await requireAdmin();}catch{redirect('/login');}return <AdminPanel role={principal.role}/>;}
