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
    assert.equal(t.tickets, E.START_TICKETS - t.casualtyTickets - t.bleed - (t.vehicleLoss || 0), "ticket ledger");
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
  assert.equal(m.teams[0].groups.reduce((n,g)=>n+g.total,0), m.teams[1].groups.reduce((n,g)=>n+g.total,0));
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
  assert.equal(new Set([...assigned,...t.reserves]).size,t.roster.length,"one membership per player");
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
console.log('PASS: fog, terrain, contested capture, vehicle respawn and orders.');
const route=E.create([armoredTeam('p',1),armoredTeam('q',1)],{balanced:false,ai:false});
const rv=route.teams[0].vehicles[0],rg=route.teams[0].groups[rv.group];
rv.x=55;rv.y=50;assert.equal(E.order(route,0,rg.index,0,'retreat'),true);E.step(route);assert.ok(rv.x<55,'armored retreat returns toward own main base');
console.log('PASS: armored retreat follows orders.');
const reputationTeam=(id,officer,soldier)=>({id,name:id,members:[{id:id+'a',rank:'Лейтенант',reputation:officer},{id:id+'b',rank:'Рядовой',role:'Боец',reputation:soldier}]});
const rating=E.create([reputationTeam('r1',0,25),reputationTeam('r2',25,0)],{balanced:false,ai:false});
assert.equal(rating.teams[0].groups[0].skill,0);
assert.equal(rating.teams[1].groups[0].skill,1);
console.log('PASS: combat rating uses the squad leader reputation.');
// Unequal source teams must have equal deployed forces and account for every participant.
const equalized=E.create([armoredTeam('large',3),team('small',4)],{balanced:true,ai:false});
const deployed=t=>t.groups.reduce((n,g)=>n+g.total,0);
assert.equal(deployed(equalized.teams[0]),deployed(equalized.teams[1]));
for(const t of equalized.teams){const all=[...t.groups.flatMap(g=>g.memberIndices),...t.reserves];assert.equal(new Set(all).size,t.roster.length);assert.equal(all.length,t.roster.length);for(const g of t.groups)assert.ok(E.isCommander(t.roster[g.commanderIndex]));}
const carryTeam=(id,kind)=>({id,name:id,members:[{id:id+'off',rank:'Капитан',role:'Commander'},{id:id+'off2',rank:'Лейтенант',role:'Commander'},{id:id+'veh',rank:'Старший прапорщик',role:'Экипаж техники',specialties:[kind]},{id:id+'foot',rank:'Рядовой',role:'Боец',specialties:['Стрелок']}]});
for(const kind of ['БМП','БТР','Вертолёт']){
 const m=E.create([carryTeam('victim',kind),{id:'att',name:'att',members:[{id:'attc',rank:'Лейтенант'},{id:'attv',rank:'Старший прапорщик',role:'Экипаж техники',specialties:['Танк']}]}],{balanced:false,ai:false});
 const t=m.teams[0],v=t.vehicles.find(v=>v.kind===(kind==='БМП'?'ifv':kind==='БТР'?'apc':'helicopter')),g=t.groups.find(g=>g.kind==='infantry'),att=m.teams[1].vehicles[0];
 v.x=30;v.y=75;v.parked=true;v.hp=1;g.x=30;g.y=75;att.x=54;att.y=75;att.parked=true;m.teams[1].groups[att.group].x=54;m.teams[1].groups[att.group].y=75;
 assert.equal(E.transport(m,0,g.index,v.id,'board'),'');const crewCount=v.crew.length,passengerCount=g.ready;E.step(m);assert.equal(v.destroyed,true,kind+' destroyed');assert.equal(v.respawnAt,m.turn+20,'vehicle returns after 20 turns');assert.equal(g.ready,0,kind+' passenger squad lost');assert.equal(t.groups[v.group].ready,0,kind+' crew lost');assert.equal(t.deaths,crewCount+passengerCount);verify(m);
}
console.log('PASS: actual roster balancing and complete crew/passenger loss.');
const special=E.create([teamWithSupply('special'),{id:'armor',name:'armor',members:[{id:'armorC',rank:'Лейтенант'},{id:'armorV',rank:'Старший прапорщик',role:'Экипаж техники',specialties:['Танк']}]}],{balanced:false,ai:false});
const st=special.teams[0],sg=st.groups.find(g=>g.kind==='infantry'),sv=st.vehicles[0],lostIndex=st.roster.findIndex(p=>p.name==='Engineer');
sg.activeIndices=sg.activeIndices.filter(k=>k!==lostIndex);sg.ready=sg.activeIndices.length;sg.queue.push({at:100,count:1,members:[lostIndex]});sg.x=45;sg.y=75;sg.target=1;sv.x=45;sv.y=75;sv.parked=true;sv.hp=40;
const target=special.teams[1].vehicles[0];target.x=55;target.y=75;target.parked=true;special.teams[1].groups[target.group].x=55;special.teams[1].groups[target.group].y=75;
E.step(special);assert.equal(sg.atShots||0,0,'inactive anti-tank specialist cannot fire');
for(const t of special.teams)for(const g of t.groups){assert.equal(g.ready,g.activeIndices.length);assert.equal(new Set([...g.activeIndices,...g.queue.flatMap(q=>q.members)]).size,g.total)}
console.log('PASS: inactive specialists cannot provide repair or anti-tank fire.');
// Casualty counts can exceed the remaining tickets while the ledger stays bounded.
const lastTicket=E.create([carryTeam('victim2','БМП'),{id:'lastatt',name:'lastatt',members:[{id:'lc',rank:'Лейтенант'},{id:'lv',rank:'Старший прапорщик',role:'Экипаж техники',specialties:['Танк']}]}],{balanced:false,ai:false});
const lt=lastTicket.teams[0],lv=lt.vehicles[0],lg=lt.groups.find(g=>g.kind==='infantry'),la=lastTicket.teams[1].vehicles[0];lt.tickets=1;lt.casualtyTickets=249;lv.x=30;lv.y=75;lv.parked=true;lv.hp=1;lg.x=30;lg.y=75;la.x=54;la.y=75;la.parked=true;lastTicket.teams[1].groups[la.group].x=54;lastTicket.teams[1].groups[la.group].y=75;assert.equal(E.transport(lastTicket,0,lg.index,lv.id,'board'),'');E.step(lastTicket);assert.equal(lt.tickets,0);assert.equal(lg.ready,0);assert.equal(lt.groups[lv.group].ready,0);assert.ok(lt.deaths>0);verify(lastTicket);
console.log('PASS: complete vehicle losses and ticket accounting with only one ticket remaining.');


// Changes to non-leaders' reputations must not affect any battle outcome.
function mixedTeam(id,leader,other){
 return {id,name:id,members:[
  {id:id+"c1",name:"Commander",rank:"Лейтенант",reputation:leader},
  {id:id+"c2",name:"Armor commander",rank:"Капитан",reputation:leader},
  {id:id+"at",name:"AT",rank:"Рядовой",role:"Боец",specialties:["Лёгкая труба"],reputation:other},
  {id:id+"tank",name:"Crew",rank:"Старший прапорщик",role:"Экипаж техники",specialties:["Танк"],reputation:other}
 ]};
}
function simulate(other){
 const m=E.create([mixedTeam("blue",20,other),mixedTeam("red",16,12)],{balanced:false,ai:false,seed:"reputation-invariance"});
 for(const t of m.teams)for(const g of t.groups){g.x=45+10*g.side;g.y=50;g.order="defend";g.target=1}
 for(const t of m.teams)for(const v of t.vehicles){v.x=45+10*v.side;v.y=50;v.parked=true}
 for(let i=0;i<8;i++)E.step(m);
 // Player data differs by design; compare all remaining state, including vehicle HP, losses and logs.
 for(const t of m.teams)for(const p of t.roster){delete p.reputation;delete p.skill;delete p.skillSource}
 return JSON.stringify(m);
}
assert.equal(simulate(0),simulate(25),"soldier and crew reputation never influence infantry, AT or armor outcomes");
const commanderHigh=E.create([mixedTeam("a",25,0),mixedTeam("b",0,25)],{balanced:false,ai:false});
for(const g of commanderHigh.teams[0].groups)assert.equal(g.skill,1);
for(const g of commanderHigh.teams[1].groups)assert.equal(g.skill,0);
const saved=JSON.parse(JSON.stringify(commanderHigh)),squad=saved.teams[0].groups[0];
squad.skill=.123;squad.commanderDown=false;
squad.activeIndices=squad.activeIndices.filter(i=>i!==squad.commanderIndex);
squad.ready=squad.activeIndices.length;
squad.queue.push({at:20,count:1,members:[squad.commanderIndex]});
E.refreshRatings(saved);
assert.equal(squad.skill,1,"stored score recalculated from commander, not survivors");
assert.equal(squad.commanderDown,true,"missing commander gets penalty");
squad.activeIndices.push(squad.commanderIndex);squad.ready++;squad.queue.pop();
E.refreshRatings(saved);assert.equal(squad.commanderDown,false,"commander recovery removes penalty");
const unrated=E.create([{id:"no",name:"Unrated",members:[{id:"x",rank:"Лейтенант"}]},team("other",1)],{balanced:false,ai:false});
assert.equal(unrated.teams[0].groups[0].skill,.5,"unrated leader uses neutral value");
console.log("PASS: leader-only combat rating, soldier/crew reputation invariance, recovery and saved-game migration.");

function opposingTankHull(leader) {
  const m=E.create([mixedTeam('a',leader,12),mixedTeam('b',12,12)],{balanced:false,ai:false,seed:'leader-effect'});
  for(const t of m.teams) for(const g of t.groups){g.x=50;g.y=50;g.target=1;g.order='defend';}
  for(const t of m.teams) for(const v of t.vehicles){v.x=45+10*v.side;v.y=50;v.parked=true;}
  E.step(m);
  return m.teams[1].vehicles[0].hp;
}
assert.ok(opposingTankHull(25)<opposingTankHull(0), 'commander reputation changes the damage actually dealt');
console.log('PASS: commander reputation changes actual vehicle damage.');

const AM=E.create([teamWithSupply("ally"),teamWithSupply("enemy")],{balanced:false,ai:false,seed:"ammo"});
const side=AM.teams[0],foot=side.groups.find(g=>g.kind==="infantry"),truck=side.vehicles.find(v=>v.kind==="logistics");
assert.equal(foot.ammo,foot.total*100,"100 rounds per squad member");
foot.x=22;foot.y=55;foot.target=0;truck.x=22;truck.y=55;truck.parked=true;foot.ammo=7;
E.step(AM);assert.equal(foot.ammo,foot.total*100,"nearby crewed supply replenishes");
truck.x=90;truck.y=90;foot.ammo=42;E.step(AM);assert.equal(foot.ammo,42,"ammo does not regenerate when supply is far");
truck.x=foot.x;truck.y=foot.y;truck.destroyed=true;truck.respawnAt=100;E.step(AM);assert.equal(foot.ammo,42,"destroyed vehicle does not supply");
assert.equal(E.buildHab,undefined);assert.equal(E.repair,undefined);assert.equal(side.habs,undefined);
const attack=E.create([team("blue",1),team("red",1)],{balanced:false,ai:false,seed:"simultaneous"});
for(const t of attack.teams){const g=t.groups[0];g.x=50;g.y=61;g.target=1;g.order="defend";g.suppression=0;g.morale=100}
E.step(attack);assert.equal(attack.engagements.length,2);assert.ok(attack.engagements.every(e=>e.suppression===0&&e.morale===100),"both infantry attacks use pre-contact suppression and morale");
assert.ok(attack.teams[0].groups[0].ammo<100 && attack.teams[1].groups[0].ammo<100,"both sides expend rounds");
for(const t of equalized.teams)for(const v of t.vehicles)assert.equal(v.target,t.groups[v.group].target,"vehicles follow balanced squad target");
console.log("PASS: nearby logistics supply, ammunition depletion, simultaneous infantry and initial vehicle targets.");

const migrationStart=html.indexOf("function warMigrate(v){"),migrationEnd=html.indexOf("\ntry{const v=JSON.parse(localStorage",migrationStart);
assert.ok(migrationStart>=0&&migrationEnd>migrationStart);
const migrate=vm.runInNewContext(html.slice(migrationStart,migrationEnd)+"\nwarMigrate;");
const old={match:{version:4,turn:5,teams:[{habs:[{id:"H"}],repairs:2,supplied:50,groups:[{ammo:12,total:9}],vehicles:[{repair:{at:6},cargo:120,destination:{type:"hab",id:"H"},destroyed:true,respawnAt:8}]}],log:[{turn:2,events:[{kind:"hab"},{kind:"capture",side:0,point:"A"}]}],orders:[{hab:"H"},{target:1}]}};
const migrated=migrate(old).match;assert.equal(migrated.version,5);assert.equal(migrated.teams[0].groups[0].ammo,450);assert.equal(migrated.teams[0].habs,undefined);assert.equal(migrated.teams[0].vehicles[0].repair,undefined);assert.equal(migrated.teams[0].vehicles[0].respawnAt,25);assert.equal(migrated.log[0].events.length,1);assert.equal(migrated.orders.length,1);assert.equal(migrated.teams[0].supplied,0);
console.log("PASS: saved-match migration removes old supply objects and preserves ammo proportion.");
