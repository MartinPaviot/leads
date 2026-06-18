const http=require('http'),fs=require('fs'),path=require('path');
const root=__dirname;
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/_contact-sheet.html';
  const fp=path.join(root,p);
  if(!fp.startsWith(root)){res.writeHead(403);return res.end('no');}
  fs.readFile(fp,(e,d)=>{ if(e){res.writeHead(404);return res.end('404');}
    res.writeHead(200,{'content-type':types[path.extname(fp)]||'application/octet-stream'});res.end(d);});
}).listen(8911,()=>console.log('serving on 8911'));
