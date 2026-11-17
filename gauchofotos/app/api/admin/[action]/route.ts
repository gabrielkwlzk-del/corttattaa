import { createHash } from 'crypto';
import { db, fail, isAdmin, makeSession, passwordMatches, requireAdmin, signed, token } from '@/lib/server';
import { watermark } from '@/lib/watermark';

export const runtime='nodejs';
export const maxDuration=60;
const json=(x:unknown,s=200)=>Response.json(x,{status:s});
async function emailOrder(orderId:string){
  const supa=db(); const {data:order,error}=await supa.from('orders').select('*').eq('id',orderId).single(); if(error||!order) throw new Error('Pedido não encontrado.');
  const {data:items,error:ie}=await supa.from('order_items').select('photo_id,photos(filename)').eq('order_id',orderId); if(ie) throw ie;
  const base=process.env.NEXT_PUBLIC_SITE_URL||'https://gauchofotos.vercel.app'; const page=`${base}/pedido/${order.token}`;
  const safe=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  const rows=(items||[]).map((item:any)=>`<p><img src="${page}/foto/${item.photo_id}" width="240" alt="${safe(item.photos?.filename||'Foto')}" style="display:block;border-radius:8px"><a href="${page}/baixar/${item.photo_id}">Baixar ${safe(item.photos?.filename||'foto')}</a></p>`).join('');
  const html=`<div style="font-family:Arial,sans-serif;background:#10141a;color:#fff;padding:28px"><h1>Suas fotos estão prontas</h1><p>Olá, ${safe(order.name)}. Seu pagamento foi confirmado.</p>${rows}<p><a href="${page}" style="color:#f7b64c">Abrir pedido e baixar todas as fotos</a></p></div>`;
  if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL) throw new Error('Configure RESEND_API_KEY e RESEND_FROM_EMAIL.');
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[order.email],subject:'Suas fotos — Esporte Show Online',html})});
  if(!response.ok) throw new Error(`Resend: ${response.status} ${(await response.text()).slice(0,300)}`);
  await supa.from('orders').update({email_error:null}).eq('id',orderId);
}
export async function POST(req:Request,{params}:{params:Promise<{action:string}>}){
  const {action}=await params;
  try{
    if(action==='login'){
      const ip=req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
      const hash=createHash('sha256').update(ip+(process.env.SESSION_SECRET||'')).digest('hex');
      const supa=db(); const cutoff=new Date(Date.now()-15*60000).toISOString();
      const {password}=await req.json();
      if(typeof password==='string'&&passwordMatches(password)){
        await supa.from('admin_login_attempts').delete().eq('ip_hash',hash);
        const response=json({ok:true}); response.headers.append('Set-Cookie',`admin_session=${makeSession()}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Strict`); return response;
      }
      const {count,error}=await supa.from('admin_login_attempts').select('id',{count:'exact',head:true}).eq('ip_hash',hash).gte('created_at',cutoff);
      if(error) throw error; if((count||0)>=5) return json({error:'Muitas tentativas. Aguarde 15 minutos.'},429);
      await supa.from('admin_login_attempts').insert({ip_hash:hash}); return json({error:'Senha incorreta.'},401);
    }
    await requireAdmin();
    const origin=req.headers.get('origin'); if(origin&&new URL(origin).host!==new URL(req.url).host) return json({error:'Origem inválida.'},403);
    if(action==='logout'){const response=json({ok:true});response.headers.append('Set-Cookie','admin_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict');return response;}
    if(action==='backup'){
      const s=db();const tables=['folders','photos','orders','order_items'];const data:Record<string,unknown>={exported_at:new Date().toISOString()};
      for(const table of tables){const r=await s.from(table).select('*');if(r.error)throw r.error;data[table]=r.data;}
      return new Response(JSON.stringify(data,null,2),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="esporte-show-backup.json"'}});
    }
    const body=await req.json();const s=db();
    if(action==='folder'){
      if(body.op==='create'){const name=String(body.name||'').trim();const price=Number(body.default_price_cents);if(!name||name.length>80||!Number.isInteger(price)||price<100) return json({error:'Nome ou preço inválido.'},400);const r=await s.from('folders').insert({name,default_price_cents:price}).select().single();if(r.error)throw r.error;return json(r.data);}
      if(body.op==='update'){const patch:any={};if(body.name!==undefined)patch.name=String(body.name).trim();if(body.default_price_cents!==undefined)patch.default_price_cents=Number(body.default_price_cents);if(body.cover_photo_id!==undefined)patch.cover_photo_id=body.cover_photo_id||null;const r=await s.from('folders').update(patch).eq('id',body.id).select().single();if(r.error)throw r.error;return json(r.data);}
      if(body.op==='delete'){const r=await s.from('folders').delete().eq('id',body.id);if(r.error)throw r.error;return json({ok:true});}
    }
    if(action==='upload-start'){
      const {data:folder,error:fe}=await s.from('folders').select('id').eq('id',body.folder_id).single();if(fe||!folder)return json({error:'Pasta não encontrada.'},404);
      const filename=String(body.filename||'foto.jpg');const mime=String(body.mime||'');const size=Number(body.size);
      if(!['image/jpeg','image/png','image/webp','image/heic','image/avif'].includes(mime)||size>30*1024*1024||size<=0)return json({error:'Foto inválida ou maior que 30 MB.'},400);
      const id=crypto.randomUUID(),path=`${body.folder_id}/${id}/${filename.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
      const {data:photo,error:pe}=await s.from('photos').insert({id,folder_id:body.folder_id,original_path:path,filename,visible:false}).select().single();if(pe)throw pe;
      const {data:upload,error:ue}=await s.storage.from('originais').createSignedUploadUrl(path);if(ue||!upload)throw ue||new Error('Falha ao assinar upload.');
      return json({photo,upload});
    }
    if(action==='upload-finish'){
      const {data:photo,error:pe}=await s.from('photos').select('*').eq('id',body.id).single();if(pe||!photo)throw pe||new Error('Foto não encontrada.');
      const {data:original,error:oe}=await s.storage.from('originais').download(photo.original_path);if(oe||!original)throw oe||new Error('Original ainda não chegou ao Storage.');
      const preview=await watermark(Buffer.from(await original.arrayBuffer()));const previewPath=`${photo.folder_id}/${photo.id}.jpg`;
      const {error:ue}=await s.storage.from('previews').upload(previewPath,preview,{contentType:'image/jpeg',upsert:true});if(ue)throw ue;
      const {data:ready,error:re}=await s.from('photos').update({preview_path:previewPath,visible:true}).eq('id',photo.id).select().single();if(re)throw re;
      return json(ready);
    }
    if(action==='photo'){
      if(body.op==='update'){const patch:any={};if(body.visible!==undefined)patch.visible=!!body.visible;if(body.price_cents!==undefined)patch.price_cents=body.price_cents===null?null:Number(body.price_cents);const r=await s.from('photos').update(patch).eq('id',body.id).select().single();if(r.error)throw r.error;return json(r.data);}
      if(body.op==='delete'){
        const {count}=await s.from('order_items').select('order_id',{count:'exact',head:true}).eq('photo_id',body.id);if(count)return json({error:'Foto vendida não pode ser excluída; oculte-a para preservar o pedido.'},409);
        const {data:photo,error:pe}=await s.from('photos').select('*').eq('id',body.id).single();if(pe)throw pe;
        await s.from('photos').update({visible:false}).eq('id',body.id);
        const paths=photo.preview_path?[photo.preview_path]:[];if(paths.length){const rr=await s.storage.from('previews').remove(paths);if(rr.error)throw rr.error;}
        const rr=await s.storage.from('originais').remove([photo.original_path]);if(rr.error)throw rr.error;
        const dr=await s.from('photos').delete().eq('id',body.id);if(dr.error)throw dr.error;return json({ok:true});
      }
    }
    if(action==='order'){
      if(body.op==='paid'){
        const r=await s.from('orders').update({status:'pago',paid_at:new Date().toISOString()}).eq('id',body.id).select().single();if(r.error)throw r.error;
        if(process.env.EMAIL_ENABLED!=='true') return json({ok:true,email:'desativado'});
        try{await emailOrder(body.id);return json({ok:true,email:'enviado'});}catch(e){const message=e instanceof Error?e.message:String(e);await s.from('orders').update({email_error:message}).eq('id',body.id);return json({ok:true,email:'falhou',error:message});}
      }
      if(body.op==='resend'){if(process.env.EMAIL_ENABLED!=='true')return json({error:'Envio por e-mail desativado.'},400);try{await emailOrder(body.id);return json({ok:true});}catch(e){const message=e instanceof Error?e.message:String(e);await s.from('orders').update({email_error:message}).eq('id',body.id);return json({error:message},502);}}
      if(body.op==='delete'){const r=await s.from('orders').delete().eq('id',body.id);if(r.error)throw r.error;return json({ok:true});}
    }
    return json({error:'Ação inválida.'},400);
  }catch(e){return fail(e,e instanceof Error&&e.message==='Acesso não autorizado.'?401:500);}
}
export async function GET(_req:Request,{params}:{params:Promise<{action:string}>}){
  try{await requireAdmin();const {action}=await params;const s=db();
    if(action==='data'){
      const [folders,photos,orders,items]=await Promise.all([s.from('folders').select('*').order('created_at'),s.from('photos').select('*').order('created_at',{ascending:false}),s.from('orders').select('*').order('created_at',{ascending:false}),s.from('order_items').select('*')]);
      for(const r of [folders,photos,orders,items])if(r.error)throw r.error;
      const signedPhotos=await Promise.all((photos.data||[]).map(async(p:any)=>({...p,preview_url:p.preview_path?await signed('previews',p.preview_path,300):null})));
      return json({folders:folders.data,photos:signedPhotos,orders:orders.data,items:items.data,email_enabled:process.env.EMAIL_ENABLED==='true'});
    }
    return json({error:'Ação inválida.'},400);
  }catch(e){return fail(e,e instanceof Error&&e.message==='Acesso não autorizado.'?401:500);}
}
