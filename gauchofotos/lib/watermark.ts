import sharp from 'sharp';
import { WATERMARK_STAMP_BASE64 } from './watermark-stamp';
export async function watermark(input:Buffer){
  const normalized=await sharp(input).rotate().resize({width:1600,withoutEnlargement:true}).jpeg({quality:90}).toBuffer();
  const meta=await sharp(normalized).metadata();
  if(!meta.width||!meta.height) throw new Error('Imagem inválida.');
  const width=meta.width,height=meta.height;
  const stamp=await sharp(Buffer.from(WATERMARK_STAMP_BASE64,'base64')).rotate(-27,{background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  const stampMeta=await sharp(stamp).metadata();
  const stampWidth=stampMeta.width||300,stampHeight=stampMeta.height||200;
  const marks=[];
  for(let top=-60,row=0;top<height;top+=170,row++)for(let left=-120+(row%2?150:0);left<width;left+=300){
    marks.push({input:stamp,left:Math.max(0,left),top:Math.max(0,top)});
  }
  return sharp(normalized).composite(marks).jpeg({quality:84}).toBuffer();
}
