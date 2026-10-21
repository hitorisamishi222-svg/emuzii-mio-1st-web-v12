/**
 * Server-only adapter to the pinned major version of SimpleWebAuthn.
 * Use this module inside trusted backend context only, never take a
 * replacement verifier from an HTTP request. NOT wired to production.
 */
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';
export const participantWebauthnV208=Object.freeze({
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
});
