const CACHE="squad-shell-v75";
const SHELL=["./","./index.html","./favicon.svg","./icon-192.png","./icon-512.png","./manifest.webmanifest"];
const shellUrls=new Set(SHELL.map(path=>new URL(path,self.registration.scope).href));
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("squad-shell-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=="GET"||url.origin!==self.location.origin||!shellUrls.has(url.href))return;
 event.respondWith(fetch(request).then(async response=>{
  if(response.ok){try{const cache=await caches.open(CACHE);await cache.put(request,response.clone())}catch(error){console.warn("Shell cache update failed",error)}}
  return response;
 }).catch(async()=>await caches.match(request)||(request.mode==="navigate"?await caches.match("./index.html"):null)||Response.error()));
});
