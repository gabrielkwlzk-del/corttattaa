import { createClient } from '@supabase/supabase-js';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

export function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, key, {auth:{persistSession:false}});
}
export function siteUrl() { return process.env.NEXT_PUBLIC_SITE_URL || 'https://gauchofotos.vercel.app'; }
export function token() { return randomBytes(32).toString('base64url'); }
export function passwordMatches(value:string) {
  const saved = process.env.ADMIN_PASSWORD_HASH;
  if (!saved) throw new Error('Configure ADMIN_PASSWORD_HASH.');
  const [salt, hash] = saved.split(':');
  if (!salt || !hash) throw new Error('ADMIN_PASSWORD_HASH inválido.');
  const actual = scryptSync(value, Buffer.from(salt,'hex'),32);
  return timingSafeEqual(actual,Buffer.from(hash,'hex'));
}
function sign(value:string) {
  if (!process.env.SESSION_SECRET) throw new Error('Configure SESSION_SECRET.');
  return createHmac('sha256',process.env.SESSION_SECRET).update(value).digest('base64url');
}
export function makeSession() { const value = `${Date.now()+7*86400000}.${token()}`; return `${value}.${sign(value)}`; }
export async function isAdmin() {
  const cookie=(await cookies()).get('admin_session')?.value;
  if (!cookie) return false;
  const i=cookie.lastIndexOf('.'); if(i<0) return false;
  const value=cookie.slice(0,i), signature=cookie.slice(i+1);
  const expected=sign(value);
  if(signature.length!==expected.length || !timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) return false;
  return Number(value.split('.')[0])>Date.now();
}
export async function requireAdmin() { if(!await isAdmin()) throw new Error('Acesso não autorizado.'); }
export async function signed(bucket:'previews'|'originais', path:string, seconds=60, download=false) {
  const {data,error}=await db().storage.from(bucket).createSignedUrl(path,seconds,download?{download:true}:undefined);
  if(error||!data) throw new Error(`Falha ao acessar ${bucket}: ${error?.message}`);
  return data.signedUrl;
}
export function fail(error:unknown,status=500) { return Response.json({error:error instanceof Error?error.message:'Erro inesperado.'},{status}); }
