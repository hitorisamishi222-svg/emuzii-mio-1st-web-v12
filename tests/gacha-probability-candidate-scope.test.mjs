import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('probability candidate changes only participantCatalog_; protected GAS source is untouched',()=>{
  const protectedSource=readFileSync(new URL('../APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs',import.meta.url),'utf8');
  const staged=readFileSync(new URL('../release-prep/gacha-probability-display-v191-candidate.gs',import.meta.url),'utf8');

  assert.match(staged,/DEVELOPMENT CANDIDATE ONLY/);
  const sourceHeader='/**\n * 翠央1周年';
  const i=staged.indexOf(sourceHeader);
  assert.ok(i>=0,'original GAS source must remain embedded after candidate header');
  const candidate=staged.slice(i);

  const functionHead='function participantCatalog_(catalog,wonKeys){';
  const nextFunction='\nfunction catalog_(ss,mode){';
  const a=protectedSource.indexOf(functionHead), b=candidate.indexOf(functionHead);
  const x=protectedSource.indexOf(nextFunction,a),y=candidate.indexOf(nextFunction,b);
  assert.ok([a,b,x,y].every(n=>n>=0),'both sources must contain the isolated function');
  assert.equal(candidate.slice(0,b),protectedSource.slice(0,a),'everything before the gacha function must be identical');
  assert.equal(candidate.slice(y),protectedSource.slice(x),'everything after the gacha function must be identical');
  assert.notEqual(candidate.slice(b,y),protectedSource.slice(a,x),'candidate must have one explicit scoped change');
  assert.match(candidate.slice(b,y),/scaled=p\.units\*10000/);
  assert.match(candidate.slice(b,y),/left=10000-shares\.reduce/);
});
