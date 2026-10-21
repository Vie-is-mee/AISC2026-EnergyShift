"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {snap, machinesFor, eligibleFor, durationFor, preview} = require("../demo-interactive-gantt.js");
test("snaps pointer movements to integer slots and clamps to horizon", () => {
  assert.equal(snap(235, 100, 400, 40, 2, 3), 12);
  assert.equal(snap(-100, 100, 400, 40, 2, 3), 0);
  assert.equal(snap(1000, 100, 400, 40, 2, 3), 37);
});
test("shows all declared machines as drop rows, not just currently occupied machines", () => {
  const scene = {textile:false, machines:["M1"],report:{input_snapshot:{machines:[{id:"M1"},{id:"M2"}],
    jobs:[{id:"J1",eligible:{M1:{},M2:{}}}]}}};
  assert.deepEqual(machinesFor(scene), ["M1","M2"]);
  assert.deepEqual(eligibleFor(scene,{id:"J1"}), ["M1","M2"]);
  assert.deepEqual(eligibleFor({textile:true},{machine:"M1"}), ["M1"]);
});
test("machine-specific durations affect the end slot and allowed drop range", () => {
  const scene={textile:false,stepMinutes:30,horizon:48,
    report:{input_snapshot:{jobs:[{id:"J4",eligible:{M2:{duration_min:120},M3:{duration_min:135}}}]}}};
  const job={id:"J4",machine:"M2",start:44,end:48};
  const plan={horizon:48,jobs:[job]};
  assert.equal(durationFor(scene,job,"M2"),4);
  assert.equal(durationFor(scene,job,"M3"),4.5);
  assert.equal(snap(1000,100,400,48,0,4.5),43);
  assert.equal(preview(plan,job,"M3",44,["M2","M3"],durationFor(scene,job,"M3")).status,"BLOCKED");
  assert.equal(preview(plan,job,"M3",43,["M2","M3"],durationFor(scene,job,"M3")).status,"REVIEW_REQUIRED");
  assert.equal(durationFor({textile:true},job,"M3"),4);
});
test("frontend preview never claims PASS and blocks incompatible machine", () => {
  const plan={horizon:10,jobs:[{id:"J1",machine:"M1",start:1,end:3},{id:"J2",machine:"M2",start:3,end:5}]};
  const job=plan.jobs[0];
  assert.equal(preview(plan,job,"M3",2,["M1","M2"]).status,"BLOCKED");
  assert.equal(preview(plan,job,"M1",9,["M1","M2"]).status,"BLOCKED");
  assert.equal(preview(plan,job,"M2",3,["M1","M2"]).status,"REVIEW_REQUIRED");
  assert.deepEqual(preview(plan,job,"M2",3,["M1","M2"]).overlaps,["J2"]);
  assert.equal(preview(plan,job,"M1",4,["M1","M2"]).status,"REVIEW_REQUIRED");
});
