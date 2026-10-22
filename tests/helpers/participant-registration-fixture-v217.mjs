/**
 * Synthetic, ephemeral software authenticator for WebAuthn registration tests.
 * Produces valid CBOR/COSE and ES256 packed self-attestation vectors.
 * No real Face ID/Touch ID/Android device is exercised.
 */
import {createHash,createSign,generateKeyPairSync,randomBytes} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest();
const b64=value=>Buffer.from(value).toString('base64url');
function bytes(value){
  const b=Buffer.from(value),n=b.length;
  if(n<24)return Buffer.concat([Buffer.from([0x40+n]),b]);
  if(n<256)return Buffer.concat([Buffer.from([0x58,n]),b]);
  if(n<65536)return Buffer.concat([Buffer.from([0x59,n>>8,n&255]),b]);
  throw Error('CBOR_VECTOR_TOO_LARGE');
}
function str(value){
  const b=Buffer.from(value),n=b.length;
  if(n<24)return Buffer.concat([Buffer.from([0x60+n]),b]);
  if(n<256)return Buffer.concat([Buffer.from([0x78,n]),b]);
  throw Error('CBOR_TEXT_TOO_LARGE');
}
export function syntheticRegistration({
  challenge,origin='https://mio-staging.test',rpID='mio-staging.test',
  format='packed',up=true,uv=true,brokenSignature=false,
  differentSigningKey=false,clientType='webauthn.create',
  rawIdMismatch=false
}={}){
  if(typeof challenge!=='string'||challenge.length<16)throw Error('CHALLENGE_REQUIRED');
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const jwk=publicKey.export({format:'jwk'});
  // CBOR map: COSE EC2 {kty: EC2, alg: ES256, crv: P256, x, y}
  const cose=Buffer.concat([
    Buffer.from([0xa5,1,2,3,0x26,0x20,1,0x21]),
    bytes(Buffer.from(jwk.x,'base64url')),
    Buffer.from([0x22]),
    bytes(Buffer.from(jwk.y,'base64url'))
  ]);
  const credentialId=randomBytes(32);
  const authData=Buffer.concat([
    sha(rpID),Buffer.from([(up?1:0)|(uv?4:0)|0x40]),
    Buffer.alloc(4),Buffer.alloc(16),Buffer.from([0,credentialId.length]),
    credentialId,cose
  ]);
  const clientData=Buffer.from(JSON.stringify({
    type:clientType,challenge,origin,crossOrigin:false
  }));
  let attStmt=Buffer.from([0xa0]);
  if(format==='packed'){
    const signingKey=differentSigningKey?
      generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey:privateKey;
    const signature=createSign('SHA256')
      .update(Buffer.concat([authData,sha(clientData)])).sign(signingKey);
    if(brokenSignature)signature[signature.length-1]^=1;
    attStmt=Buffer.concat([
      Buffer.from([0xa2]),str('alg'),Buffer.from([0x26]),
      str('sig'),bytes(signature)
    ]);
  }
  if(!['none','packed'].includes(format))throw Error('INVALID_FORMAT');
  const attestation=Buffer.concat([
    Buffer.from([0xa3]),str('fmt'),str(format),
    str('attStmt'),attStmt,str('authData'),bytes(authData)
  ]);
  const id=b64(rawIdMismatch?randomBytes(32):credentialId);
  return {
    id,rawId:id,type:'public-key',
    response:{
      clientDataJSON:b64(clientData),attestationObject:b64(attestation),
      transports:['internal']
    },
    clientExtensionResults:{}
  };
}
