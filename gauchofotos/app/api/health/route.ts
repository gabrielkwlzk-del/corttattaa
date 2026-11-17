import { db } from '@/lib/server';
export const runtime='nodejs';
export async function GET(){
  const status:Record<string,unknown>={database:'falhou',storage:'falhou',email:'falhou'};
  try{const s=db();const r=await s.from('folders').select('id',{head:true,count:'exact'});if(r.error)throw r.error;status.database='ok';
    const b=await s.storage.listBuckets();if(b.error)throw b.error;const needed=['previews','originais'];status.storage=needed.every(n=>b.data?.some(x=>x.name===n&&!x.public))?'ok':'Faltam buckets privados previews/originais';
  }catch(e){status.detail=e instanceof Error?e.message:String(e);}
  if(process.env.EMAIL_ENABLED!=='true') status.email='desativado';
  else if(process.env.RESEND_API_KEY){try{const r=await fetch('https://api.resend.com/domains',{headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`},cache:'no-store'});status.email=r.ok&&process.env.RESEND_FROM_EMAIL?'ok':`Resend: HTTP ${r.status} ou remetente não configurado`;}catch(e){status.email=e instanceof Error?e.message:'Falha de rede';}}
  else status.email='Configure RESEND_API_KEY';
  const ok=status.database==='ok'&&status.storage==='ok'&&(status.email==='ok'||status.email==='desativado');return Response.json({ok,...status},{status:ok?200:503,headers:{'Cache-Control':'no-store'}});
}
