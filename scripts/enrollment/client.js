const $ = id => document.getElementById(id);
const fromUrl = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
const url64 = b => b64(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function post(path,data) {
  const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await res.json();if(!res.ok)throw Error(result.error);return result;
}
let config;
async function refresh(initial=false) {
  config=await (await fetch('/config')).json();
  $('binding').textContent=`Origin: ${config.origin} | RP-ID: ${config.rpId}`;
  $('registrations').textContent=JSON.stringify(config.registrations,null,2);
  if(initial)$('status').textContent=Object.keys(config.registrations).length===3?'Los tres registros están disponibles para descargar.':'Elegí un responsable para registrar su passkey.';
  $('download').disabled=Object.keys(config.registrations).length !== 3;
  document.querySelectorAll('[data-role]').forEach(b=>{b.disabled=!!config.registrations[b.dataset.role];});
}
document.querySelectorAll('[data-role]').forEach(button=>button.addEventListener('click',async()=>{
  document.querySelectorAll('[data-role]').forEach(b=>{b.disabled=true;});
  try {
    const role=button.dataset.role;
    $('status').textContent=`${role}: use this officer's own authenticator and verify the browser prompt.`;
    const c=await post('/challenge',{role});
    const credential=await navigator.credentials.create({publicKey:{
      challenge:fromUrl(c.create),rp:{id:c.rpId,name:'PUCARÁ — Development'},
      user:{id:fromUrl(c.userId),name:`${role}@${c.rpId}`,displayName:role},
      pubKeyCredParams:[{type:'public-key',alg:-7}],attestation:'none',
      authenticatorSelection:{residentKey:'preferred',userVerification:'required'},timeout:120000,
      excludeCredentials:c.excludeCredentials.map(id=>({type:'public-key',id:fromUrl(id)})),
    }});
    if(!credential.response.getPublicKey || credential.response.getPublicKeyAlgorithm()!==-7) throw Error('Browser must support ES256 public-key export');
    const spki=credential.response.getPublicKey();if(!spki)throw Error('No public key returned');
    const proof=await navigator.credentials.get({publicKey:{challenge:fromUrl(c.get),rpId:c.rpId,
      userVerification:'required',timeout:120000,allowCredentials:[{type:'public-key',id:credential.rawId}]}});
    if(url64(proof.rawId)!==url64(credential.rawId))throw Error('Credential changed');
    await post('/register',{id:c.id,credentialId:url64(credential.rawId),publicKeySPKI:b64(spki),
      creationClientDataJSON:b64(credential.response.clientDataJSON),clientDataJSON:b64(proof.response.clientDataJSON),
      authenticatorData:b64(proof.response.authenticatorData),signatureDER:b64(proof.response.signature)});
    $('status').textContent=`${role}: registered and proof of possession verified.`;
  } catch(error) {$('status').textContent=error.message;}
  await refresh();
}));
$('download').addEventListener('click',()=>{
  const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(config.registrations,null,2)],{type:'application/json'}));
  link.download='signers.json';link.click();URL.revokeObjectURL(link.href);
});
refresh(true).catch(error=>{$('status').textContent=error.message;});
