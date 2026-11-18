import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const base=process.env.TEST_BASE_URL;
const password=process.env.ADMIN_TEST_PASSWORD;
test('pasta → upload → compra → confirmação → original → limpeza', {skip:!base||!password?'Defina TEST_BASE_URL e ADMIN_TEST_PASSWORD para o teste integrado.':false,timeout:180000},async()=>{
  let cookie='',folder,photo,order;
  async function api(path,body,auth=true){const r=await fetch(`${base}${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Cookie:cookie}:{})},body:JSON.stringify(body)});const d=await r.json();assert.ok(r.ok,`${path}: ${JSON.stringify(d)}`);return {r,d};}
  try{
    for(let i=0;i<5;i++){const wrong=await fetch(`${base}/api/admin/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'senha-errada'})});assert.equal(wrong.status,401);}
    const login=await api('/api/admin/login',{password},false);cookie=login.r.headers.get('set-cookie')?.split(';')[0]||'';assert.ok(cookie);
    folder=(await api('/api/admin/folder',{op:'create',name:`Teste ${Date.now()}`,default_price_cents:1250})).d;
    const image=await sharp({create:{width:800,height:600,channels:3,background:{r:10,g:100,b:180}}}).withMetadata({orientation:6}).jpeg().toBuffer();
    const start=(await api('/api/admin/upload-start',{folder_id:folder.id,filename:'teste.jpg',mime:'image/jpeg',size:image.length})).d;photo=start.photo;
    const upload=await fetch(start.upload.signedUrl,{method:'PUT',headers:{'Content-Type':'image/jpeg'},body:image});assert.ok(upload.ok,await upload.text());
    const ready=(await api('/api/admin/upload-finish',{id:photo.id})).d;assert.ok(ready.visible&&ready.preview_path);
    const catalog=await (await fetch(`${base}/api/public/catalog`)).json();const listed=catalog.photos.find(p=>p.id===photo.id);assert.ok(listed);const preview=Buffer.from(await (await fetch(listed.preview_url)).arrayBuffer());assert.notDeepEqual(preview,image);
    order=(await api('/api/public/checkout',{name:'Teste de fluxo',email:'teste@example.com',photo_ids:[photo.id]},false)).d;assert.equal(order.total_cents,1250);
    assert.ok(order.pix_code.includes('0114+5547992145561'),'Chave Pix deve estar em E.164');
    let crc=0xffff;for(const byte of Buffer.from(order.pix_code.slice(0,-4))){crc^=byte<<8;for(let i=0;i<8;i++)crc=crc&0x8000?((crc<<1)^0x1021)&0xffff:(crc<<1)&0xffff;}assert.equal(order.pix_code.slice(-4),crc.toString(16).toUpperCase().padStart(4,'0'));
    const before=await fetch(`${base}/api/order/${order.token}/baixar/${photo.id}`,{redirect:'manual'});assert.equal(before.status,403);
    const admin=await (await fetch(`${base}/api/admin/data`,{headers:{Cookie:cookie}})).json();const record=admin.orders.find(o=>o.token===order.token);assert.ok(record);
    await api('/api/admin/order',{op:'paid',id:record.id});
    const after=await fetch(`${base}/api/order/${order.token}/baixar/${photo.id}`);assert.ok(after.ok);const original=Buffer.from(await after.arrayBuffer());assert.deepEqual(original,image);
    const page=await (await fetch(`${base}/api/public/order?token=${order.token}`)).json();assert.equal(page.status,'pago');
  }finally{
    if(order){const admin=await (await fetch(`${base}/api/admin/data`,{headers:{Cookie:cookie}})).json();const record=admin.orders?.find(o=>o.token===order.token);if(record)await api('/api/admin/order',{op:'delete',id:record.id});}
    if(photo)await api('/api/admin/photo',{op:'delete',id:photo.id});
    if(folder)await api('/api/admin/folder',{op:'delete',id:folder.id});
  }
});
