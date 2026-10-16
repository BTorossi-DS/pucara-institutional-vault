/* Run in your approved HTTPS RP application's console after reviewing request.json.
   No private keys are exported. Each person runs this independently with their own passkey.
   request must be the JSON emitted by `prepare`, role must be one of request.pair.
*/
async function collectInstitutionalApproval(request, role) {
  if (location.origin !== request.origin) throw Error('Wrong signing origin');
  if (!request.pair.includes(role)) throw Error('Role is not in selected pair');
  const fromUrl = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const toBase64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
  // Review the actual asset, recipient, base-unit amount, auth tree, network and expiry.
  console.table(request.intent);
  if (!confirm('Approve the displayed Testnet transfer? Review request.entryXdr and challenge against your independent proposal copy.')) return;
  const credential = await navigator.credentials.get({publicKey: {
    challenge: fromUrl(request.challenge), rpId: request.rpId, userVerification: 'required', timeout: 120000,
    allowCredentials: [{type: 'public-key', id: fromUrl(request.signers[role].credentialId)}],
  }});
  const response = credential.response;
  const assertion = {publicKey: request.signers[role].publicKey,
    signatureDER: Array.from(new Uint8Array(response.signature), x => x.toString(16).padStart(2, '0')).join(''),
    authenticatorData: toBase64(response.authenticatorData), clientDataJSON: toBase64(response.clientDataJSON)};
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(assertion, null, 2)], {type:'application/json'}));
  link.download = `${role}-assertion.json`; link.click(); URL.revokeObjectURL(link.href);
}
