// SOLAR — serve the app on your local network so a phone browser can open it.
// No dependencies. Run: node serve-lan.js   (or double-click serve-lan.cmd)
const http=require("http"), fs=require("fs"), path=require("path"), os=require("os");
const ROOT=__dirname, PORT=8080;
const T={html:"text/html; charset=utf-8",js:"text/javascript; charset=utf-8",css:"text/css; charset=utf-8",
json:"application/json",csv:"text/csv",svg:"image/svg+xml",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",
gif:"image/gif",ico:"image/x-icon",woff:"font/woff",woff2:"font/woff2",ttf:"font/ttf",
docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
wasm:"application/wasm",gz:"application/gzip",map:"application/json",txt:"text/plain; charset=utf-8",
mp3:"audio/mpeg",ogg:"audio/ogg"};
const mime=p=>T[(p.split(".").pop()||"").toLowerCase()]||"application/octet-stream";
http.createServer((req,res)=>{
  let p=decodeURIComponent((req.url.split("?")[0]||"/"));
  if(p==="/"||p==="") p="/hero.html";   // canonical front door - matches Vercel redirect + exe_build/server.js (keep in sync)
  if(p.endsWith("/")) p=p+"index.html";  // directory request -> its index.html (e.g. /registry/ -> /registry/index.html)
  let f=path.join(ROOT,p.replace(/^\/+/,""));
  if(!f.startsWith(ROOT)){res.writeHead(403);return res.end("no");}
  // if the path resolves to a directory (no trailing slash), serve its index.html
  try { if(fs.statSync(f).isDirectory()) f=path.join(f,"index.html"); } catch(_){}
  fs.readFile(f,(e,buf)=>{ if(e){res.writeHead(404);return res.end("Not found: "+p);}
    res.writeHead(200,{"Content-Type":mime(f),"Cache-Control":"no-cache"}); res.end(buf); });
}).listen(PORT,"0.0.0.0",()=>{
  const ips=[]; const ni=os.networkInterfaces();
  Object.keys(ni).forEach(k=>ni[k].forEach(a=>{if(a.family==="IPv4"&&!a.internal)ips.push(a.address);}));
  console.log("\n  SOLAR is serving on your network.\n");
  console.log("  On your PHONE (same Wi-Fi), open one of these in the browser:");
  ips.forEach(ip=>console.log("     http://"+ip+":"+PORT+"/"));
  if(!ips.length) console.log("     (no LAN IP found — check Wi-Fi)");
  console.log("\n  Then use the browser menu -> 'Add to Home Screen' for an app icon.");
  console.log("  Keep this window open while using it. Ctrl+C to stop.\n");
});
