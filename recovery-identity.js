/**
 * DEPRECATED UNSAFE DRAFT.
 * Never generate a new Web-ID during an existing participant's recovery.
 * Use recoveryToken() from recovery-token.js and have GAS select the
 * operator-approved EXISTING Web-ID instead.
 */
export {recoveryToken} from './recovery-token.js';
