import test from 'node:test';
import assert from 'node:assert/strict';
import {economics,initialEconomics,tokenCost,methods} from './model.mjs';
test('8-person scenario deducts maintenance and support without declaring personal revenue',()=>{
 const r=economics(initialEconomics);assert.equal(r.grossHours,72);assert.equal(r.netHours,16);assert.equal(r.netValue,1680);assert.equal(r.personal,0);
});
test('zero adoption retains losses and produces no recognized value',()=>{
 const r=economics({...initialEconomics,adoption:0,recognition:100,share:100});assert.equal(r.netHours,-56);assert.equal(r.netValue,-11280);assert.equal(r.recognized,0);
});
test('40-person annual scenario and attribution are separate',()=>{
 const r=economics({...initialEconomics,people:40,weeks:46,onboarding:40,ai:6000,infra:3000,recognition:20,share:50});assert.equal(r.netHours,1800);assert.equal(r.netValue,315000);assert.equal(r.recognized,63000);assert.equal(r.personal,31500);
});
test('input and output token rates use million-token units',()=>{assert.equal(tokenCost(12000,2000,2,8),0.04);assert.equal(tokenCost(0,0,2,8),0)});
test('six work methods have unique identifiers and review boundaries',()=>{assert.equal(methods.length,6);assert.equal(new Set(methods.map(x=>x.id)).size,6);assert.ok(methods.every(x=>x.input&&x.output&&x.boundary&&x.gate))});
