import test from 'node:test';
import assert from 'node:assert/strict';
import {testAuthDeploymentGate} from './mio-test-deployment-gate.mjs';
const valid={
 MIO_TEST_AUTH_ENABLED:'true',VERCEL_ENV:'preview',
 VERCEL_GIT_COMMIT_REF:'release/v2-next-integrated-replica',
 MIO_TEST_DATABASE_URL:'postgresql://mio_test:example@db.example.test:5432/mio_dev_test',
 MIO_TEST_ORIGIN:'https://emuzii-mio-1st-web-v12-cz7gbwuzu-gtgz8867jh-3139.vercel.app'
};
test('only explicitly enabled isolated preview is allowed',()=>{
 assert.equal(testAuthDeploymentGate(valid).ok,true);
 for(const [key,value] of Object.entries({
  MIO_TEST_AUTH_ENABLED:'false',VERCEL_ENV:'production',
  VERCEL_GIT_COMMIT_REF:'main',
  MIO_TEST_DATABASE_URL:'postgresql://user:secret@db.example.test/mio_production',
  MIO_TEST_ORIGIN:'https://example.com'
 })){
  assert.equal(testAuthDeploymentGate({...valid,[key]:value}).ok,false,key);
 }
});
test('missing config always fails closed',()=>{
 assert.equal(testAuthDeploymentGate({}).ok,false);
 for(const key of Object.keys(valid)){
  const env={...valid};delete env[key];
  assert.equal(testAuthDeploymentGate(env).ok,false,key);
 }
});
test('invalid TEST database URLs and preview URLs are rejected',()=>{
 for(const url of ['not a url','https://db.example.test/mio_dev_test',
  'postgresql://x:y@db.example.test/prod',
  'postgresql://x:y@db.example.test/mio_dev_test_extra-invalid']){
  assert.equal(testAuthDeploymentGate({...valid,MIO_TEST_DATABASE_URL:url}).ok,false,url);
 }
 for(const url of ['http://emuzii-mio-1st-web-v12-68vp-foo.vercel.app',
  'https://emuzii-mio-1st-web-v12-git-main.vercel.app',
  'https://emuzii-mio-1st-web-v12-68vp-foo.vercel.app/path']){
  assert.equal(testAuthDeploymentGate({...valid,MIO_TEST_ORIGIN:url}).ok,false,url);
 }
});
