#![no_std]

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contracterror, contractevent, contractimpl, contracttype,
    crypto::Hash,
    panic_with_error, Address, BytesN, Env, Map, String, Symbol, Val, Vec,
};
use stellar_accounts::smart_account::{
    self, AuthPayload, ContextRule, ContextRuleType, ExecutionEntryPoint, Signer, SmartAccountError,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InstitutionalSigners {
    pub ceo: BytesN<65>,
    pub cfo: BytesN<65>,
    pub treasury_manager: BytesN<65>,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Signers,
    Verifier,
    Rules,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    DuplicateSigner = 1,
    InvalidKey = 2,
}

#[contractevent]
pub struct SignersRotated {
    pub signers: InstitutionalSigners,
}

#[contract]
pub struct InstitutionalAccount;

fn validate(e: &Env, signers: &InstitutionalSigners) {
    if signers.ceo == signers.cfo
        || signers.ceo == signers.treasury_manager
        || signers.cfo == signers.treasury_manager
    {
        panic_with_error!(e, Error::DuplicateSigner);
    }
    for key in [&signers.ceo, &signers.cfo, &signers.treasury_manager] {
        if key.get(0) != Some(4) {
            panic_with_error!(e, Error::InvalidKey);
        }
    }
}

fn configure(e: &Env, signers: &InstitutionalSigners, verifier: &Address) {
    let identities = [
        Signer::External(verifier.clone(), signers.ceo.to_bytes()),
        Signer::External(verifier.clone(), signers.cfo.to_bytes()),
        Signer::External(verifier.clone(), signers.treasury_manager.to_bytes()),
    ];
    let mut rules = Vec::<u32>::new(e);
    // No-policy OZ rules require ALL listed signers. These four rules cover
    // precisely every subset of size >= 2, with no weaker authorization path.
    for indices in [&[0usize, 1][..], &[0, 2][..], &[1, 2][..], &[0, 1, 2][..]] {
        let members = Vec::from_iter(e, indices.iter().map(|i| identities[*i].clone()));
        let rule = smart_account::add_context_rule(
            e,
            &ContextRuleType::Default,
            &String::from_str(e, "institutional"),
            None,
            &members,
            &Map::new(e),
        );
        rules.push_back(rule.id);
    }
    e.storage().instance().set(&DataKey::Rules, &rules);
    e.storage().instance().set(&DataKey::Signers, signers);
}

#[contractimpl]
impl InstitutionalAccount {
    /// The immutable verifier must be the reviewed WebAuthn verifier artifact.
    /// Verify its Wasm hash and RP configuration before constructing an account.
    pub fn __constructor(e: &Env, signers: InstitutionalSigners, verifier: Address) {
        validate(e, &signers);
        e.storage().instance().set(&DataKey::Verifier, &verifier);
        configure(e, &signers, &verifier);
    }

    pub fn signers(e: &Env) -> InstitutionalSigners {
        e.storage().instance().get(&DataKey::Signers).unwrap()
    }

    pub fn rule_ids(e: &Env) -> Vec<u32> {
        e.storage().instance().get(&DataKey::Rules).unwrap()
    }

    pub fn rule(e: &Env, id: u32) -> ContextRule {
        smart_account::get_context_rule(e, id)
    }

    /// Replace the three role keys atomically, authorized by the OLD quorum.
    /// Fresh rule IDs invalidate outstanding signatures from the old configuration.
    pub fn rotate_signers(e: &Env, signers: InstitutionalSigners) {
        e.current_contract_address().require_auth();
        validate(e, &signers);
        for id in Self::rule_ids(e) {
            smart_account::remove_context_rule(e, id);
        }
        let verifier = e.storage().instance().get(&DataKey::Verifier).unwrap();
        configure(e, &signers, &verifier);
        SignersRotated { signers }.publish(e);
    }
}

#[contractimpl]
impl CustomAccountInterface for InstitutionalAccount {
    type Error = SmartAccountError;
    type Signature = AuthPayload;

    fn __check_auth(
        e: Env,
        signature_payload: Hash<32>,
        signatures: AuthPayload,
        auth_contexts: Vec<Context>,
    ) -> Result<(), Self::Error> {
        smart_account::do_check_auth(&e, &signature_payload, &signatures, &auth_contexts)
    }
}

// Deliberately do not export the generic SmartAccount management trait: it
// could permit reducing a rule to one signer. Rotation is the sole mutation.
#[contractimpl(contracttrait)]
impl ExecutionEntryPoint for InstitutionalAccount {}

#[cfg(test)]
mod test;
