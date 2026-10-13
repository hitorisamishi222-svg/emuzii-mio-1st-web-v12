// V2 authorization and upload input policy. Pure functions: no secrets, no storage.
// Every production API must verify a server-issued session before calling these helpers.
export const AUDIO_EXTENSIONS = Object.freeze(['mp3','m4a','aac','wav','flac','ogg','oga','opus']);
export const ARTWORK_MIME = Object.freeze(['image/jpeg','image/png','image/webp','image/gif']);
export const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
export const MAX_ARTWORK_BYTES = 5 * 1024 * 1024;
export const ROLES = Object.freeze(['anonymous','participant','member','operator','owner']);
export function normalizeRole(role) { return ROLES.includes(role) ? role : 'anonymous'; }
export function canModerate(session) {
  return !!session?.verified && ['owner','operator'].includes(normalizeRole(session.role));
}
export function canAdminister(session) {
  return !!session?.verified && normalizeRole(session.role) === 'owner';
}
export function canUploadMusic(session, now = Date.now()) {
  return !!session?.verified && normalizeRole(session.role) === 'member'
    && Number.isFinite(session.membershipExpiresAt) && session.membershipExpiresAt > now;
}
export function validateMusicMetadata({title, artist, fileName, fileSize, artworkMime, artworkSize} = {}) {
  const errors = [];
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 80) errors.push('invalid_title');
  if (typeof artist !== 'string' || !artist.trim() || artist.trim().length > 40) errors.push('invalid_artist');
  const ext = typeof fileName === 'string' ? fileName.split('.').pop()?.toLowerCase() : '';
  if (!AUDIO_EXTENSIONS.includes(ext)) errors.push('invalid_audio_extension');
  if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > MAX_AUDIO_BYTES) errors.push('invalid_audio_size');
  if (artworkMime != null && !ARTWORK_MIME.includes(artworkMime)) errors.push('invalid_artwork_mime');
  if (artworkMime != null && (!Number.isSafeInteger(artworkSize) || artworkSize < 1 || artworkSize > MAX_ARTWORK_BYTES)) errors.push('invalid_artwork_size');
  return {ok: errors.length === 0, errors};
}
// MIME/extension checks are not sufficient: production upload finalization MUST inspect magic bytes.
export function assertAuthorized(session, permission, now = Date.now()) {
  const ok = permission === 'upload-music' ? canUploadMusic(session, now)
    : permission === 'moderate' ? canModerate(session)
    : permission === 'admin' ? canAdminister(session) : false;
  return {ok, status: !session?.verified ? 401 : ok ? 200 : 403};
}
