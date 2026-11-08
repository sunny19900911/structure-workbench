import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {PPT_COMMAND_ARGUMENTS} from '../../../office-ppt-commands.js';
import {OFFICE_COMMAND_ARGUMENTS} from '../../../mcp-browser-operations.js';
const require=createRequire(process.env.WORKBENCH_TEST_DEPENDENCIES?join(process.env.WORKBENCH_TEST_DEPENDENCIES,'package.json'):import.meta.url);
const Ajv=require('ajv');
test('PPT commands merge with Office MCP schemas without replacing Word image insertion',()=>{
 const merged={...OFFICE_COMMAND_ARGUMENTS,...PPT_COMMAND_ARGUMENTS};
 const validators=Object.fromEntries(Object.entries(merged).map(([name,schema])=>[name,new Ajv({strict:false}).compile(schema)]));
 assert.ok(validators['slide.move']({slide:1,to:2}));
 assert.ok(validators['shape.geometry']({slide:1,shapeId:'2',expectedGeometry:{x:0,y:0,width:1,height:1},width:900000}));
 assert.equal(validators['shape.geometry']({slide:1,shapeId:'2',expectedGeometry:{x:0,y:0,width:1,height:1},width:-1}),false);
 assert.equal(validators['shape.format']({slide:1,shapeId:'2',fontSize:200}),false);
 assert.ok(validators['history.undo']({}));assert.ok(validators['history.redo']({}));
 assert.ok(validators['ppt.image.insert']({slide:1,data:'data:image/png;base64,YWJj'}));
 assert.equal(validators['image.insert']({slide:1,data:'data:image/png;base64,YWJj'}),false);
});
