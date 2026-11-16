import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

// All credentials stay in the Cloudflare build environment. This script never reads
// or prints tokens and never changes the selected Cloudflare billing plan.
export function resolveDatabase(config, run) {
 const name=config.match(/^database_name\s*=\s*"([^"]+)"/m)?.[1];
 const id=config.match(/^database_id\s*=\s*"([^"]+)"/m)?.[1];
 if(!name||!id)throw Error('Configurazione D1 mancante');
 const list=()=>{const rows=JSON.parse(run(['d1','list','--json']));if(!Array.isArray(rows))throw Error('Risposta D1 non valida');return rows;};
 let rows=list();
 const placeholder=id==='00000000-0000-0000-0000-000000000000';
 let db=placeholder?rows.find(d=>d.name===name):rows.find(d=>d.uuid===id);
 if(!db&&!placeholder)throw Error('Il database configurato non è presente: non ne creo uno sostitutivo.');
 if(!db){
  let createError;
  try{run(['d1','create',name,'--location','weur','--update-config=false']);}catch(e){createError=e;}
  rows=list();db=rows.find(d=>d.name===name);
  if(!db)throw createError||Error('Database D1 non creato');
 }
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(db.uuid)||db.uuid==='00000000-0000-0000-0000-000000000000')throw Error('ID D1 non valido');
 return config.replace(/^database_id\s*=\s*"[^"]+"/m,`database_id = "${db.uuid}"`);
}
export function deploy(run){
 const config=resolveDatabase(readFileSync('wrangler.toml','utf8'),run);
 const resolved='.wrangler-resolved.toml';writeFileSync(resolved,config);
 run(['d1','migrations','apply','DB','--remote','--config',resolved],true);
 run(['deploy','--config',resolved,'--keep-vars'],true);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const run=(args,visible=false)=>{
  const result=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),...args],{encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:visible?'inherit':['ignore','pipe','pipe']});
  if(result.error||result.status!==0){
   if(!visible){process.stderr.write(result.stderr||'');process.stderr.write(result.stdout||'');}
   throw Error('Operazione Cloudflare fallita. Se viene indicato un errore di autorizzazione D1, aggiungere Account → D1 → Edit al token della build.');
  }
  return result.stdout||'';
 };
 try{deploy(run);}catch(e){console.error(e.message);process.exitCode=1;}
}
