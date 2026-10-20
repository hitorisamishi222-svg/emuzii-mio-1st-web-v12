import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeBrowserAdmin } from './v198-browser-admin-auth.mjs';
const binding={webId:'MIO-W-example',mioId:'MIO-0001'};
const principal={id:'admin-1',verified:true,source:'trusted-server',permissions:['browser:approve']};
const check=(p,b=binding)=>authorizeBrowserAdmin({principal:p,permission:'browser:approve',verificationBoundTo:b});
test('only a verified privileged principal can authorize',()=>assert.equal(check(principal),true));
test('review cell or claimed admin alone cannot authorize',()=>{
 assert.equal(check({id:'admin-1',verified:false,source:'trusted-server',permissions:['browser:approve']}),false);
 assert.equal(check({...principal,source:'review-cell'}),false);
 assert.equal(check({...principal,permissions:[]}),false);
});
test('unknown principal or missing verification binding fails closed',()=>{
 assert.equal(check(null),false);
 assert.equal(check(principal,{webId:'',mioId:'MIO-0001'}),false);
});
