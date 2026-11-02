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
function team(id, size) { return { id, name: id, members: Array.from({ length: size }, (_, i) => ({ id: id + i, name: "Player " + i })) }; }
function verify(m) {
  for (const t of m.teams) {
    assert.equal(t.tickets, E.START_TICKETS - t.deaths - t.bleed, "ticket ledger");
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
