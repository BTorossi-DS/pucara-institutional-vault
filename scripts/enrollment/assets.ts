import type {IncomingMessage,ServerResponse} from 'node:http';
import {readFileSync} from 'node:fs';
const assets:Record<string,{name:string;type:string}>={
  '/assets/pucara.css':{name:'pucara.css',type:'text/css; charset=utf-8'},
  '/assets/logo.svg':{name:'logo.svg',type:'image/svg+xml'},
  '/assets/mark.svg':{name:'mark.svg',type:'image/svg+xml'},
};
export function serveBrandAsset(req:IncomingMessage,res:ServerResponse):boolean {
  const asset=req.url && Object.hasOwn(assets,req.url)?assets[req.url]:undefined;
  if(req.method!=='GET'||!asset)return false;
  const content=readFileSync(new URL(`./assets/${asset.name}`,import.meta.url));
  res.writeHead(200,{'Content-Type':asset.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(content);return true;
}
