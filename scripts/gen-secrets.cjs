/* Prints fresh secrets to paste into the Vercel dashboard (API project). Run:  node scripts/gen-secrets.cjs
 * Store them somewhere safe: changing FIELD_ENCRYPTION_KEY later makes stored NID/passport numbers unreadable. */
const { randomBytes } = require('crypto');
console.log('JWT_SECRET=' + randomBytes(48).toString('base64url'));
console.log('FIELD_ENCRYPTION_KEY=' + randomBytes(32).toString('base64'));
