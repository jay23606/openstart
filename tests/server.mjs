import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const root=resolve(".");
const types={".css":"text/css",".html":"text/html",".js":"text/javascript",".json":"application/json",".png":"image/png",".svg":"image/svg+xml",".webmanifest":"application/manifest+json"};
createServer(async(request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,"http://localhost").pathname);
  if(pathname==="/config.js" && process.env.E2E_SUPABASE_URL && process.env.E2E_SUPABASE_ANON_KEY){
    response.setHeader("Content-Type","text/javascript");
    response.end(`export const SUPABASE_URL=${JSON.stringify(process.env.E2E_SUPABASE_URL)};\nexport const SUPABASE_ANON_KEY=${JSON.stringify(process.env.E2E_SUPABASE_ANON_KEY)};\n`);
    return;
  }
  let path=resolve(root,`.${pathname}`);
  if(!path.startsWith(`${root}${sep}`) && path!==root){response.writeHead(403).end();return;}
  try{
    if((await stat(path)).isDirectory()) path=resolve(path,"index.html");
    response.setHeader("Content-Type",types[extname(path)] || "application/octet-stream");
    createReadStream(path).pipe(response);
  }catch{
    response.writeHead(404).end("Not found");
  }
}).listen(Number(process.env.PORT || 4173),"127.0.0.1");
