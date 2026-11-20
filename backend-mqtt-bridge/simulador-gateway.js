// Simulador local del contrato HTTP del gateway: node simulador-gateway.js
// Usa solo Node 18+, sin paquetes externos.
import http from 'node:http';
const PORT = Number(process.env.SIM_PORT || 8000);
const started = Date.now();
let events = [], id=0, seq=0, occupied=0;
function add(entradas,salidas) {
  occupied=Math.max(0,occupied+entradas-salidas);
  const now=Date.now();
  events.push({id:++id,nodo:5,mac:'24:6F:28:AA:BB:CC',seq:seq++,ts:now,gw_ms:now-started,
    uptime_ms:now-started,perdidos:0,tipo:'termico',entradas,salidas,ocupacion_est:occupied,
    personas_en_vista:entradas||salidas?1:0,cruces_dudosos:0,t_fondo:28.5,t_max:34.7,calibrando:0,
    anomalias:'NINGUNA',anom_bits:0});
}
add(0,0);
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,`http://localhost:${PORT}`);
 res.setHeader('access-control-allow-origin','*');
 res.setHeader('content-type','application/json; charset=utf-8');
 if(url.pathname==='/api/estado') return res.end(JSON.stringify({gw_ms:Date.now()-started,id_ultimo:id,hora_ok:true,descartados:0}));
 if(url.pathname==='/api/hora') return res.end(JSON.stringify({ts:Date.now()}));
 if(url.pathname==='/api/ultimos') {
  const msg=events.at(-1);return res.end(JSON.stringify([{nodo:5,tipo:'termico',hace_s:Math.floor((Date.now()-msg.ts)/1000),anomalias:'NINGUNA',msg}]));
 }
 if(url.pathname==='/api/datos') {
  const from=Number(url.searchParams.get('desde')||0),max=Number(url.searchParams.get('max')||2000);
  res.setHeader('content-type','application/x-ndjson');
  return res.end(events.filter(e=>e.id>from).slice(0,max).map(e=>JSON.stringify(e)).join('\n')+'\n');
 }
 if(url.pathname==='/demo/entrada') {add(1,0);return res.end(JSON.stringify(events.at(-1)));}
 if(url.pathname==='/demo/salida') {add(0,1);return res.end(JSON.stringify(events.at(-1)));}
 if(url.pathname==='/') return res.end(JSON.stringify({message:'Simulador gateway L419',test_entrada:'/demo/entrada',test_salida:'/demo/salida'}));
 res.statusCode=404;res.end('{"error":"Not found"}');
});
server.listen(PORT,'127.0.0.1',()=>console.log(`Simulador gateway: http://localhost:${PORT}`));
