const $=id=>document.getElementById(id);
const fromUrl=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const url64=b=>b64(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
let config, state, busy=false, reviewSucceeded=false;
function controls() {
  $('review').disabled=busy||!config||state?.completed;
  $('confirm').disabled=busy||!reviewSucceeded;
  document.querySelectorAll('[data-role]').forEach(b=>{
    b.disabled=busy||!reviewSucceeded||!$('confirm').checked||state.completed||state.captured.includes(b.dataset.role);
  });
  $('simulate').hidden=config?.purpose==='transfer';
  $('simulate').disabled=config?.purpose==='transfer'||busy||!reviewSucceeded||!state||state.completed||state.captured.length!==2;
}
async function post(path,data={}) {
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...data,csrf:config.csrf,proposalId:config.proposalId})});
  const result=await response.json();if(!response.ok)throw Error(result.error);return result;
}
$('confirm').addEventListener('change',controls);
$('review').addEventListener('click',async()=>{
  busy=true;reviewSucceeded=false;$('confirm').checked=false;controls();
  try {
    state=await post('/authorization/review');reviewSucceeded=true;
    $('reviewed').textContent=JSON.stringify(state.review,null,2);$('status').textContent='Review passed. Each officer must confirm the displayed proposal before approving.';
  } catch(error) {$('status').textContent=error.message;}
  finally {busy=false;controls();}
});
document.querySelectorAll('[data-role]').forEach(button=>button.addEventListener('click',async()=>{
  if(busy||!reviewSucceeded||!$('confirm').checked||state.completed||state.captured.includes(button.dataset.role))return;
  busy=true;controls();const role=button.dataset.role;
  try {
    const options=await post('/authorization/options',{role});
    if(options.proposalId!==config.proposalId||options.challenge!==config.challenge||options.rpId!==config.rpId)throw Error('Proposal changed; stop this session');
    $('status').textContent=`${role}: approve the reviewed Testnet ${config.purpose==='transfer'?'1 XLM transfer':'probe'} using this officer's registered authenticator.`;
    // This explicit button click is the only place that initiates a WebAuthn ceremony.
    const credential=await navigator.credentials.get({publicKey:{challenge:fromUrl(options.challenge),rpId:options.rpId,
      allowCredentials:[{type:'public-key',id:fromUrl(options.credentialId)}],userVerification:'required',timeout:120000}});
    if(!credential||credential.type!=='public-key'||url64(credential.rawId)!==options.credentialId)throw Error('Wrong credential returned');
    state=await post('/authorization/assertion',{assertion:{role,credentialId:url64(credential.rawId),publicKey:options.publicKey,
      clientDataJSON:b64(credential.response.clientDataJSON),authenticatorData:b64(credential.response.authenticatorData),
      signatureDER:Array.from(new Uint8Array(credential.response.signature),x=>x.toString(16).padStart(2,'0')).join('')}});
    $('status').textContent=config.purpose==='transfer'&&state.completed?'CEO and CFO approvals validated.':`${role}: assertion verified and saved for this proposal.`;
  } catch(error) {
    $('status').textContent=error.message;
    try {await post('/authorization/cancel',{role});} catch { /* Keep the displayed failure; never replace a challenge. */ }
  } finally {busy=false;$('confirm').checked=false;controls();}
}));
$('simulate').addEventListener('click',async()=>{
  if(config?.purpose==='transfer')return;
  busy=true;controls();
  try {
    const result=await post('/authorization/simulate');state=result;
    $('report').textContent=JSON.stringify(result.report,null,2);$('status').textContent=`Enforce simulation: ${result.report.simulation}`;
  } catch(error) {$('status').textContent=error.message;}
  finally {busy=false;controls();}
});
// Loading the page only displays a proposal. It cannot review, capture or simulate automatically.
(async()=>{
  config=await(await fetch('/config')).json();state=config;
  if(config.mode!=='authorization'||location.origin!==config.origin||config.origin!=='https://localhost:8443'||!window.isSecureContext)throw Error('Wrong authorization origin or insecure context');
  if(config.purpose!==undefined&&!['probe','transfer'].includes(config.purpose))throw Error('Unknown authorization purpose');
  $('proposal').textContent=JSON.stringify({operation:config.intent,network:config.network,requiredSigners:['ceo','cfo'],ruleIds:config.ruleIds,
    origin:config.origin,rpId:config.rpId,challenge:config.challenge,expirationLedger:config.expirationLedger,proposalId:config.proposalId},null,2);
  controls();
  $('status').textContent='Propuesta cargada. Validá sus datos antes de autorizar.';
})().catch(error=>{$('status').textContent=error.message;});
