import {randomBytes,scryptSync} from 'node:crypto';
import {createInterface} from 'node:readline';
const rl=createInterface({input:process.stdin,output:process.stdout});
const password=await new Promise(resolve=>rl.question('Senha do painel: ',resolve));rl.close();
const salt=randomBytes(16);const hash=scryptSync(password,salt,32);
process.stdout.write(`${salt.toString('hex')}:${hash.toString('hex')}\n`);
