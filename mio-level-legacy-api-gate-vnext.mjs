// Production opt-in bridge for existing MIO-W APIs. The gate remains off
// until an explicit release flag is set; then GAS authenticates first and
// Neon applies levels only to operation-linked legacy sessions.
import {authorizeLegacyFeature} from './mio-level-legacy-auth-vnext.mjs';

let pool;

export function legacyFeatureGateEnabled(env=process.env){
 return env.VERCEL_ENV==='production'&&env.MIO_LEVEL_ADMIN_RELEASE==='vnext-verified';
}

export async function legacyLevelDatabase(env=process.env){
 if(!legacyFeatureGateEnabled(env))return null;
 if(!env.MIO_LEVEL_DATABASE_URL)throw Error('LEVEL_AUTH_UNAVAILABLE');
 if(!pool){const {default:pg}=await import('pg');pool=new pg.Pool({connectionString:env.MIO_LEVEL_DATABASE_URL,
  ssl:{rejectUnauthorized:true},max:4,connectionTimeoutMillis:5000,
  idleTimeoutMillis:10000,application_name:'mio-level-legacy-api'});}
 return pool;
}

export async function authorizeLegacyApiFeature({db,session,gasStatus,resource,now=new Date()}){
 if(!session||gasStatus?.participantId!==session.id)throw Error('GAS_IDENTITY_MISMATCH');
 if(!db)throw Error('LEVEL_AUTH_UNAVAILABLE');
 const decision=await authorizeLegacyFeature({db,session,resource,gasAuthenticated:true,now});
 if(!decision.allowed)throw Error(decision.reason==='LEVEL_REQUIRED'?'FEATURE_LEVEL_REQUIRED':'SESSION_AUTH_REQUIRED');
 return decision;
}
