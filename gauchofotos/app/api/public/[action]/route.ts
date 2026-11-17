import { db, fail, signed, token } from '@/lib/server';
import { pixCode } from '@/lib/pix';
import QRCode from 'qrcode';
export const runtime='nodejs';
const json=(x:unknown,s=200)=>Response.json(x,{status:s});
export async function GET(req:Request,{params}:{params:Promise<{action:string}>}){
  try{const {action}=await params;const s=db();
    if(action==='catalog'){
      const [fr,pr]=await Promise.all([s.from('folders').select('*').order('name'),s.from('photos').select('id,folder_id,preview_path,filename,price_cents,created_at').eq('visible',true).not('preview_path','is',null).order('created_at',{ascending:false})]);
      if(fr.error)throw fr.error;if(pr.error)throw pr.error;
      const photos=await Promise.all((pr.data||[]).map(async p=>({...p,preview_url:await signed('previews',p.preview_path,300)})));
      return json({folders:fr.data,photos});
    }
    if(action==='order'){
      const tok=new URL(req.url).searchParams.get('token');if(!tok||tok.length<40)return json({error:'Pedido não encontrado.'},404);
      const {data:order,error}=await s.from('orders').select('*').eq('token',tok).single();if(error||!order)return json({error:'Pedido não encontrado.'},404);
      const {data:items,error:ie}=await s.from('order_items').select('photo_id,price_cents,photos(filename,preview_path,original_path)').eq('order_id',order.id);if(ie)throw ie;
      const photos=await Promise.all((items||[]).map(async(item:any)=>({id:item.photo_id,filename:item.photos.filename,price_cents:item.price_cents,image_url:order.status==='pago'?`/api/order/${tok}/foto/${item.photo_id}`:await signed('previews',item.photos.preview_path,300)})));
      return json({status:order.status,name:order.name,total_cents:order.total_cents,pix_code:order.status==='pago'?undefined:order.pix_code,photos});
    }
    return json({error:'Ação inválida.'},400);
  }catch(e){return fail(e);}
}
export async function POST(req:Request,{params}:{params:Promise<{action:string}>}){
  try{const {action}=await params;const s=db();const body=await req.json();
    if(action==='checkout'){
      const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase();
      const ids=[...new Set((Array.isArray(body.photo_ids)?body.photo_ids:[]).map(String))];
      if(!name||name.length>120||!/^\S+@\S+\.\S+$/.test(email)||ids.length<1||ids.length>100)return json({error:'Informe nome, e-mail e escolha fotos.'},400);
      const {data:photos,error:pe}=await s.from('photos').select('id,price_cents,folder_id,folders(default_price_cents)').in('id',ids).eq('visible',true).not('preview_path','is',null);if(pe)throw pe;
      if(!photos||photos.length!==ids.length)return json({error:'Uma foto não está mais disponível.'},409);
      const priced=photos.map((p:any)=>({photo_id:p.id,price_cents:p.price_cents??p.folders.default_price_cents}));
      const total=priced.reduce((n,p)=>n+p.price_cents,0);const tok=token();const code=pixCode(total,tok.replace(/[^A-Za-z0-9]/g,'').slice(0,25));
      const {data:order,error:oe}=await s.from('orders').insert({token:tok,name,email,total_cents:total,pix_code:code}).select().single();if(oe)throw oe;
      const {error:ie}=await s.from('order_items').insert(priced.map(p=>({...p,order_id:order.id})));if(ie){await s.from('orders').delete().eq('id',order.id);throw ie;}
      return json({token:tok,total_cents:total,pix_code:code,qr:await QRCode.toDataURL(code,{margin:1,width:280})});
    }
    if(action==='notified'){
      const tok=String(body.token||'');const {error}=await s.from('orders').update({customer_notified:true}).eq('token',tok).eq('status','pendente');if(error)throw error;return json({ok:true});
    }
    return json({error:'Ação inválida.'},400);
  }catch(e){return fail(e);}
}
