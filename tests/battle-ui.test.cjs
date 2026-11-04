"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const start=html.indexOf("function warPaint(box,html){"),end=html.indexOf("function warSquadMembers",start);
assert.ok(start>=0&&end>start);
const win={scrollX:0,scrollY:1000,calls:0,scrollTo({left,top}){this.scrollX=left;this.scrollY=top;this.calls++}};
class Node{
 constructor(name,attrs={},children=[],text=""){this.nodeName=name;this.nodeType=name==="#text"?3:1;this.nodeValue=this.nodeType===3?text:null;this.data={...attrs};this.childNodes=children;this.style={setProperty(){}};for(const c of children)c.parent=this}
 get tagName(){return this.nodeName}
 get id(){return this.data.id||""}
 get attributes(){return Object.entries(this.data).map(([name,value])=>({name,value}))}
 get firstChild(){return this.childNodes[0]||null}
 get nextSibling(){if(!this.parent)return null;const a=this.parent.childNodes;return a[a.indexOf(this)+1]||null}
 getAttribute(k){return Object.hasOwn(this.data,k)?this.data[k]:null}
 hasAttribute(k){return Object.hasOwn(this.data,k)}
 setAttribute(k,v){this.data[k]=v}
 removeAttribute(k){delete this.data[k]}
 cloneNode(deep){return new Node(this.nodeName,this.data,deep?this.childNodes.map(c=>c.cloneNode(true)):[],this.nodeValue)}
 appendChild(c){c.parent=this;this.childNodes.push(c);win.scrollY+=200}
 replaceChild(n,o){const i=this.childNodes.indexOf(o);this.childNodes[i]=n;n.parent=this;o.parent=null;win.scrollY+=200}
 removeChild(c){this.childNodes.splice(this.childNodes.indexOf(c),1);c.parent=null;win.scrollY+=200}
 isEqualNode(n){return this.nodeName===n.nodeName&&this.nodeValue===n.nodeValue&&JSON.stringify(this.data)===JSON.stringify(n.data)&&this.childNodes.length===n.childNodes.length&&this.childNodes.every((c,i)=>c.isEqualNode(n.childNodes[i]))}
}
const text=x=>new Node("#text",{},[],x), el=(name,id,children=[])=>new Node(name,id?{id}:{},children);
const structure=(notice,result,error)=>new Node("FRAGMENT",{},[
 el("DIV","war-error-slot",error?[el("P",null,[text("error")])]:[]),
 el("DIV","war-notice-slot",notice?[el("DIV",null,[text("notice")])]:[]),
 el("DIV","war-result-slot",result?[el("DIV",null,[text("result")])]:[]),
 el("DIV","battle-grid",[el("DIV","map-scroll",[el("BUTTON","squad",[text("squad")])])]),
 new Node("DETAILS",{id:"reserve"},[el("SUMMARY",null,[text("reserve")])])
]);
const templates={normal:structure(false,false,false),notice:structure(true,false,false),result:structure(false,true,false),error:structure(false,false,true)};
const document={activeElement:null,createElement(name){assert.equal(name,"template");return {set innerHTML(value){this.content=templates[value].cloneNode(true)}}}};
const warPaint=new Function("window","document","warSpeed",html.slice(start,end)+";return warPaint")(win,document,5000);
const box=el("DIV","battle");warPaint(box,"normal");assert.equal(win.scrollY,1000,"initial render preserves scroll");
const grid=box.childNodes[3],map=grid.firstChild,button=map.firstChild,details=box.childNodes[4];
details.setAttribute("open","");map.scrollTop=33;document.activeElement=button;
for(const state of ["notice","normal","error","notice","result","normal"]){
 win.scrollY=1300;const callsBefore=win.calls;warPaint(box,state);
 assert.equal(win.scrollY,1300,state+" preserves page position");
 assert.equal(box.childNodes[3],grid,state+" preserves battle grid");
 assert.equal(grid.firstChild,map,state+" preserves map element");
 assert.equal(map.firstChild,button,state+" preserves focused button");
 assert.equal(map.scrollTop,33,state+" preserves map scroll");
 assert.ok(details.hasAttribute("open"),state+" keeps details expanded");
 assert.ok(win.calls>=callsBefore);
}
win.scrollY=1750;warPaint(box,"normal");assert.equal(win.scrollY,1750,"user scroll between updates is respected");
for(const id of ["war-error-slot","war-notice-slot","war-result-slot","war-legacy-slot"])assert.ok(html.includes('id="'+id+'"'),id+" present in renderer");
assert.ok(html.includes('help.scrollIntoView('),"explicit help navigation remains available");
console.log("PASS: notices, errors and result preserve map identity, focus, expansion and scroll; user scrolling remains possible.");

{
 const start=html.indexOf("function warTick(render=true){"),end=html.indexOf("function warExport(",start);
 assert.ok(start>=0&&end>start,"battle timer functions exist");assert.ok(html.includes("warSpeed=10000"),"default interval is 10 seconds");
 const fixture=new Function(`
 let warMatch={status:"running",turn:0,log:[]},warTimer=null,warSpeed=10000,interval=0,pauses=0;
 const BattleEngine={step(m){m.turn++;m.log.push({events:[{kind:"capture",side:0}]})}};
 function warCanRun(){return true} function warPersist(){} function battleRender(){} function warArchive(){}
 function setInterval(fn,ms){interval=ms;return 99} function warPause(){warTimer=null;pauses++}
 `+html.slice(start,end)+`
 return {play:warPlay,tick:warTick,state:()=>({interval,warTimer,pauses,turn:warMatch.turn})};
 `)();
 fixture.play();assert.equal(fixture.state().interval,10000,"one turn takes 10 seconds");
 fixture.tick(false);assert.equal(fixture.state().turn,1);
 assert.equal(fixture.state().warTimer,99,"capture does not pause the timer");
 assert.equal(fixture.state().pauses,0,"no automatic pause on capture");
 fixture.play();assert.equal(fixture.state().warTimer,null,"manual pause remains available");
 for(const removed of ['id="war-speed"','id="war-pause-capture"','data-war-action="step"','data-war-action="finish"','<kbd>N</kbd>'])assert.ok(!html.includes(removed),removed+" removed");
 assert.ok(html.includes("9 человек — 1800 патронов"));assert.ok(html.includes("9 soldiers means 1800 rounds"));
 console.log("PASS: fixed 10-second turns, capture keeps running, manual pause, no skip controls, correct ammo examples.");
}
