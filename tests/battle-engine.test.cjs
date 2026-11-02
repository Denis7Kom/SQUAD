"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
const start = html.indexOf("const BattleEngine=(()=>{");
const end = html.indexOf('const warKey=', start);
assert.ok(start >= 0 && end > start, "engine boundaries");
const E = vm.runInNewContext(html.slice(start, end) + "\nBattleEngine;");
function team(id, size) { return { id, name: id, members: Array.from({ length: size }, (_, i) => ({ id: id + i, name: "Player " + i, rank: "Лейтенант", role: "Сквадлидер" })) }; }
function verify(m) {
  for (const t of m.teams) {
    assert.equal(t.tickets, E.START_TICKETS - t.deaths - t.bleed - (t.vehicleLoss || 0), "ticket ledger");
    assert.ok(t.tickets >= 0 && t.tickets <= E.START_TICKETS);
    for (const g of t.groups) {
      assert.ok(g.ready >= 0 && g.ready <= g.total);
      assert.equal(g.ready + g.queue.reduce((n, q) => n + q.count, 0), g.total, "troop conservation");
    }
  }
  assert.equal(m.teams[0].kills, m.teams[1].deaths);
  assert.equal(m.teams[1].kills, m.teams[0].deaths);
}
function finish(m) { while (m.status !== "finished") { E.step(m); verify(m); } assert.ok(m.turn <= E.LIMIT); return m; }
const teams = [team("blue", 49), team("red", 42)];
let checked = 0;
for (const ai of [false, true]) for (let i = 0; i < 400; i++) {
  const m = E.create(teams, { seed: "test-" + i, ai });
  assert.equal(m.teams[0].roster.length, 42); assert.equal(m.teams[1].roster.length, 42);
  finish(m); const before = JSON.stringify(m); E.step(m); assert.equal(JSON.stringify(m), before);
  checked++;
}
for (const [a, b] of [[1,1], [1,50], [50,1], [2,3], [50,50]]) for (let i = 0; i < 20; i++) {
  const m = E.create([team("blue", a), team("red", b)], { balanced: false, seed: "edge-" + i });
  for (let j = 0; j < 5; j++) E.step(m);
  const restored = JSON.parse(JSON.stringify(m));
  finish(m); finish(restored); assert.equal(JSON.stringify(m), JSON.stringify(restored), "resume reproducibility"); checked++;
}
const one = () => JSON.stringify(finish(E.create(teams, { seed: "same" })));
assert.equal(one(), one(), "same seed");
assert.throws(() => E.create([teams[0], teams[0]]));
assert.throws(() => E.create([team("empty", 0), teams[1]]));
const order = E.create(teams);
assert.equal(E.order(order, 0, 0, 2, "flank"), true);
assert.equal(order.teams[0].groups[0].target, 2);
assert.equal(E.order(order, 0, 0, 4, "flank"), false);
assert.equal(E.order(order, 0, 0, 1, "unknown"), false);
console.log("PASS: " + checked + " matches; ledger, troop conservation, replay, boundaries, orders, syntax.");

assert.equal(E.isCommander({rank:"Генерал",role:"Советник"}), false, "advisor excluded");
assert.equal(E.isCommander({rank:"Старший прапорщик",role:"Экипаж техники"}), false, "technical rank alone is not a commander");
assert.throws(() => E.create([{id:"a",name:"A",members:[{id:"1",rank:"Генерал",role:"Советник"}]},{id:"b",name:"B",members:team("b",1).members}]), e=>e.code==="MISSING_COMMANDERS");
const led = E.create([team("blue",49),team("red",42)]);
for (const t of led.teams) {
  const assigned = t.groups.flatMap(g=>g.memberIndices);
  assert.equal(new Set(assigned).size,t.roster.length,"one membership per player");
  for (const g of t.groups) assert.equal(E.isCommander(t.roster[g.commanderIndex]),true,"squad commander");
}

for (const enemyKind of ["БМП","БТР"]) {
 const crewTeam=(id,kind)=>({id,name:id,members:[{id:id+"c",name:"Officer",rank:"Лейтенант"},{id:id+"v",name:"Crew",rank:"Старший прапорщик",role:"Экипаж техники",specialties:[kind]}]});
 const match=E.create([crewTeam("a","Танк"),crewTeam("b",enemyKind)]);
 match.teams.forEach((t,i)=>{t.vehicles[0].x=45+i*10;t.vehicles[0].y=50;t.vehicles[0].parked=true;});
 for(let i=0;i<8;i++){E.step(match);verify(match);}
 assert.equal(match.teams[0].vehicles[0].destroyed,false);
 assert.equal(match.teams[1].vehicles[0].destroyed,true);
 assert.equal(match.teams[1].vehicleLoss,10,"asset loss charged once");
}

function armoredTeam(id, crewSize=2) {
 const members=Array.from({length:3},(_,i)=>({id:id+"o"+i,name:"Officer "+i,rank:"Лейтенант",role:"Сквадлидер"}));
 for(const [i,kind] of ["Танк","БМП","БТР"].entries())for(let j=0;j<crewSize;j++)members.push({id:id+"v"+i+j,name:"Crew "+i+j,rank:j===0?"Старший прапорщик":"Рядовой",role:"Экипаж техники",specialties:[kind],parent:j===0?null:id+"v"+i+"0"});
 return {id,name:id,members};
}
const separate=E.create([armoredTeam("a"),armoredTeam("b")],{balanced:false});
for(const t of separate.teams){
 assert.deepEqual(Array.from(t.groups,g=>g.kind),["tank","ifv","apc"]);
 assert.equal(t.vehicles.length,3);
 for(const g of t.groups){assert.equal(g.total,g.kind==="tank"?3:2);assert.equal(E.isCommander(t.roster[g.commanderIndex]),true);}
 const assigned=t.groups.flatMap(g=>g.memberIndices);assert.equal(new Set([...assigned,...t.reserves]).size,t.roster.length);
 for(const v of t.vehicles){assert.equal(v.crew.length,v.kind==="tank"?3:2);assert.ok(v.crew.includes(t.groups[v.group].commanderIndex));assert.equal(t.groups[v.group].kind,v.kind);}
}
assert.equal(E.armorIssues(separate).length,0);
const legacy=JSON.parse(JSON.stringify(separate));legacy.teams[0].groups[0].kind="technical";
assert.equal(E.armorIssues(legacy).length,1,"legacy mixed armor squad rejected");
const oversized=E.create([armoredTeam("a",3),armoredTeam("b",3)],{balanced:false});
assert.equal(oversized.teams[0].reserves.length,5);
assert.ok(oversized.teams[0].groups.every(g=>g.total===(g.kind==="tank"?3:2)));
const shortage=armoredTeam("a");shortage.members=shortage.members.filter(p=>p.id!=="ao2");
assert.throws(()=>E.create([shortage,armoredTeam("b")],{balanced:false}),e=>e.code==="MISSING_COMMANDERS");
console.log("PASS: separate tank/IFV/APC squads; 3-person capacity; distinct crews; mandatory officers; legacy validation.");


// Integration scenarios for logistics, visibility, capture and vehicle lifecycle.
const teamWithSupply=(id)=>({id,name:id,members:[
 {id:id+'c1',name:'Officer',rank:'Лейтенант'},
 {id:id+'c2',name:'Crew officer',rank:'Капитан'},
 {id:id+'eng',name:'Engineer',rank:'Рядовой',role:'Боец',specialties:['Сапёр','Лёгкая труба']},
 {id:id+'log',name:'Logistics',rank:'Старший прапорщик',role:'Экипаж техники',specialties:['Транспорт и снабжение']}
]});
const supplies=E.create([teamWithSupply('blue'),teamWithSupply('red')],{balanced:false,ai:false});
const T=supplies.teams[0],inf=T.groups.find(g=>g.kind==='infantry'),truck=T.vehicles.find(v=>v.kind==='logistics');
inf.x=20;inf.y=65;truck.x=20;truck.y=65;
assert.equal(E.buildHab(supplies,0,inf.index),'');
assert.equal(T.habs[0].ammo,0,'new HAB starts empty');
assert.equal(E.supply(supplies,0,truck.id,'load'),'base');
assert.equal(E.supply(supplies,0,truck.id,'deliver'),'');
assert.equal(T.habs[0].ammo,120);assert.equal(truck.cargo,0);
inf.ammo=3;inf.order='defend';inf.target=0;supplies.points[0].x=inf.x;supplies.points[0].y=inf.y;
E.step(supplies);assert.ok(inf.ammo>3);assert.ok(T.habs[0].ammo<120,'resupply consumes HAB stock');
truck.hp=40;truck.x=inf.x;truck.y=inf.y;assert.equal(E.repair(supplies,0,truck.id),'');assert.equal(truck.hp,70);
truck.x=80;truck.y=80;assert.equal(E.repair(supplies,0,truck.id),'engineer');
truck.x=T.base.x;truck.y=T.base.y;assert.equal(E.supply(supplies,0,truck.id,'load'),'');assert.equal(truck.cargo,120);
const fog=E.create([team('b',1),team('r',1)],{balanced:false,ai:false});
const g0=fog.teams[0].groups[0],g1=fog.teams[1].groups[0];
g0.x=10;g0.y=80;g1.x=80;g1.y=80;assert.equal(E.visible(fog,0,g1),false);
g1.x=30;assert.equal(E.visible(fog,0,g1),true);E.refreshIntel(fog);assert.ok(fog.intel[0][g1.id]);
g1.x=80;fog.turn=6;E.refreshIntel(fog);assert.equal(fog.intel[0][g1.id],undefined,'contacts expire');
assert.equal(E.terrainAt({x:27,y:32}),'forest');assert.equal(E.terrainAt({x:50,y:61}),'village');assert.equal(E.terrainAt({x:50,y:5}),'open');
const contested=E.create([team('x',1),team('y',1)],{balanced:false,ai:false});
for(const t of contested.teams){t.groups[0].x=50;t.groups[0].y=61;t.groups[0].target=1;t.groups[0].order='defend'}
contested.points[1].progress=20;E.step(contested);assert.equal(contested.points[1].progress,20,'opposing infantry contests capture');
const respawn=E.create([armoredTeam('x',1),armoredTeam('y',1)],{balanced:false,ai:false});
const vehicle=respawn.teams[0].vehicles[0];vehicle.destroyed=true;vehicle.hp=0;vehicle.respawnAt=2;
E.step(respawn);assert.equal(vehicle.destroyed,true);E.step(respawn);assert.equal(vehicle.destroyed,false);assert.equal(vehicle.hp,100);assert.equal(vehicle.x,respawn.teams[0].base.x);
const orders=E.create([team('x',10),team('y',10)],{balanced:false,ai:false});
for(const type of ['advance','attack','defend','flank','recon','retreat','escort'])assert.equal(E.order(orders,0,0,1,type),true,type);
assert.equal(E.order(orders,0,0,1,'fly'),false);
console.log('PASS: HAB creation and supply, engineer repair, fog, terrain, contested capture, vehicle respawn, orders.');
const cpu=E.create([teamWithSupply('p'),teamWithSupply('cpu')],{balanced:false,ai:true});
for(let i=0;i<14;i++)E.step(cpu);
assert.ok(cpu.teams[1].habs.length>0,'CPU infantry built a HAB');
assert.ok((cpu.teams[1].supplied||0)>0,'CPU carried ammunition to its HAB');
const route=E.create([armoredTeam('p',1),armoredTeam('q',1)],{balanced:false,ai:false});
const rv=route.teams[0].vehicles[0],rg=route.teams[0].groups[rv.group];
rv.x=55;rv.y=50;assert.equal(E.order(route,0,rg.index,0,'retreat'),true);E.step(route);assert.ok(rv.x<55,'armored retreat returns toward own main base');
console.log('PASS: CPU supply uses logistics and armored retreat follows orders.');
const reputationTeam=(id,officer,soldier)=>({id,name:id,members:[{id:id+'a',rank:'Лейтенант',reputation:officer},{id:id+'b',rank:'Рядовой',role:'Боец',reputation:soldier}]});
const rating=E.create([reputationTeam('r1',0,25),reputationTeam('r2',25,0)],{balanced:false,ai:false});
assert.ok(Math.abs(rating.teams[0].groups[0].skill-.35)<1e-10);
assert.ok(Math.abs(rating.teams[1].groups[0].skill-.65)<1e-10);
console.log('PASS: combat rating uses actual player reputation and commander contribution.');
