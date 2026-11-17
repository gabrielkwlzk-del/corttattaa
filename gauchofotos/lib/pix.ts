function field(id:string,value:string){return id+String(value.length).padStart(2,'0')+value}
export function pixCode(cents:number,txid:string){
  const merchant=field('00','br.gov.bcb.pix')+field('01','47992145561');
  const amount=(cents/100).toFixed(2);
  const body=field('00','01')+field('26',merchant)+field('52','0000')+field('53','986')+field('54',amount)+field('58','BR')+field('59','O GAUCHO')+field('60','LAGES')+field('62',field('05',txid.slice(0,25)))+'6304';
  let crc=0xffff; for(const byte of Buffer.from(body,'utf8')){crc^=byte<<8;for(let j=0;j<8;j++)crc=(crc&0x8000)?((crc<<1)^0x1021)&0xffff:(crc<<1)&0xffff;}
  return body+crc.toString(16).toUpperCase().padStart(4,'0');
}
