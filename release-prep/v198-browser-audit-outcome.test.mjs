import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBrowserAuditOutcome } from './v198-browser-audit-outcome.mjs';
const base={operationId:'op_20261011_001',action:'browser_add',actorId:'admin-1',webId:'MIO-W-example',mioId:'MIO-0001'};
test('attempt and success are separate immutable audit outcomes',()=>{
 const attempt=makeBrowserAuditOutcome({...base,phase:'attempt'});
 const success=makeBrowserAuditOutcome({...base,phase:'success'});
 assert.equal(attempt.phase,'attempt');
 assert.equal(success.phase,'success');
 assert.notEqual(attempt,success);
 assert.equal(Object.isFrozen(success),true);
});
test('failure can be recorded without a success outcome',()=>{
 const failure=makeBrowserAuditOutcome({...base,phase:'failure',detail:'write failed'});
 assert.equal(failure.phase,'failure');
});
test('reject missing actor and unknown phase',()=>{
 assert.throws(()=>makeBrowserAuditOutcome({...base,actorId:'',phase:'success'}));
 assert.throws(()=>makeBrowserAuditOutcome({...base,phase:'approved'}));
});
