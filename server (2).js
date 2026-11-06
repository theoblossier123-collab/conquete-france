// Serveur du jeu : sert la page + relaie les événements du live TikTok.
// Le pseudo vient du lien : https://ton-site.onrender.com/?user=ton_pseudo&live=1
const http=require('http'),fs=require('fs'),path=require('path');
const {WebSocketServer}=require('ws');
let WebcastPushConnection=null;
try{WebcastPushConnection=require('tiktok-live-connector').WebcastPushConnection}catch(e){console.log('Librairie TikTok indisponible:',e.message)}
process.on('uncaughtException',e=>console.log('Erreur:',e.message));
process.on('unhandledRejection',e=>console.log('Erreur:',e&&e.message));
const PORT=process.env.PORT||3000;
const html=fs.readFileSync(path.join(__dirname,'index.html'));
const srv=http.createServer((req,res)=>{
  if(req.url.startsWith('/health')){res.end('ok');return}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);
});
const wss=new WebSocketServer({server:srv});
const rooms={};
const nick=d=>d.nickname||d.uniqueId||'viewer';

function startRoom(user){
  const r={clients:new Set(),stopped:false,conn:null,timer:null};
  const send=o=>{const s=JSON.stringify(o);r.clients.forEach(c=>c.readyState===1&&c.send(s))};
  r.send=send;
  const connect=()=>{
    if(r.stopped)return;
    if(!WebcastPushConnection){send({event:'status',msg:'Connexion TikTok indisponible sur le serveur'});return}
    const t=r.conn=new WebcastPushConnection(user);
    t.connect().then(s=>{console.log('Connecté à',user,s.roomId);send({event:'status',msg:'🟢 Live connecté'})})
     .catch(e=>{console.log(user,e.message);send({event:'status',msg:'Live introuvable, nouvel essai…'});r.timer=setTimeout(connect,10000)});
    t.on('chat',d=>send({event:'chat',nickname:nick(d),comment:d.comment}));
    t.on('gift',d=>{if(d.giftType===1&&!d.repeatEnd)return;
      send({event:'gift',nickname:nick(d),coins:(d.diamondCount||1)*(d.repeatCount||1),giftName:d.giftName})});
    t.on('like',d=>send({event:'like',nickname:nick(d),likeCount:d.likeCount||1}));
    t.on('social',d=>{if(/share/i.test(d.displayType||''))send({event:'share',nickname:nick(d)})});
    t.on('disconnected',()=>{r.timer=setTimeout(connect,5000)});
  };
  r.stop=()=>{r.stopped=true;clearTimeout(r.timer);try{r.conn&&r.conn.disconnect()}catch(e){}};
  connect();return r;
}

wss.on('connection',(ws,req)=>{
  const user=(new URL(req.url,'http://x').searchParams.get('user')||'').replace('@','');
  if(!/^[a-z0-9._]{2,30}$/i.test(user)){ws.send(JSON.stringify({event:'status',msg:'Ajoute ?user=ton_pseudo au lien'}));return}
  const r=rooms[user]||(rooms[user]=startRoom(user));
  clearTimeout(r.idle);r.clients.add(ws);
  ws.send(JSON.stringify({event:'status',msg:'Connexion au live de @'+user+'…'}));
  ws.on('close',()=>{r.clients.delete(ws);
    if(!r.clients.size)r.idle=setTimeout(()=>{r.stop();delete rooms[user]},60000)});
});
srv.listen(PORT,()=>console.log('Serveur prêt sur le port',PORT));
