import { db, fail, signed } from '@/lib/server';
export const runtime='nodejs';
export async function GET(_req:Request,{params}:{params:Promise<{token:string,kind:string,photo:string}>}){
  try{const {token,kind,photo}=await params;if(token.length<40||!['foto','baixar'].includes(kind))return new Response('Não encontrado.',{status:404});
    const s=db();const {data:order,error}=await s.from('orders').select('id,status').eq('token',token).single();if(error||!order||order.status!=='pago')return new Response('Pagamento ainda não confirmado.',{status:403});
    const {data:item,error:ie}=await s.from('order_items').select('photo_id,photos(original_path)').eq('order_id',order.id).eq('photo_id',photo).single();if(ie||!item)return new Response('Foto não encontrada.',{status:404});
    const path=(item.photos as any).original_path;const url=await signed('originais',path,60,kind==='baixar');
    return Response.redirect(url,302);
  }catch(e){return fail(e);}
}
