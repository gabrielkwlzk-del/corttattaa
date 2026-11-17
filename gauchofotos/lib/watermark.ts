import sharp from 'sharp';
export async function watermark(input:Buffer){
  const normalized=await sharp(input).rotate().resize({width:1600,withoutEnlargement:true}).jpeg({quality:90}).toBuffer();
  const meta=await sharp(normalized).metadata();
  if(!meta.width||!meta.height) throw new Error('Imagem inválida.');
  const width=meta.width,height=meta.height;
  const lines=Array.from({length:Math.ceil(height/180)+3},(_,row)=>Array.from({length:Math.ceil(width/420)+3},(_,col)=>`<text x="${col*420-280}" y="${row*180+20}" transform="rotate(-28 ${col*420-280} ${row*180+20})" fill="white" fill-opacity="0.62" stroke="black" stroke-opacity="0.32" stroke-width="1" font-size="32" font-weight="800" font-family="Arial">ESPORTE SHOW ONLINE</text>`).join('')).join('');
  const svg=Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`);
  return sharp(normalized).composite([{input:svg}]).jpeg({quality:84}).toBuffer();
}
