extern crate std;

use super::*;
#[cfg(not(feature = "wasm-tests"))]
use institutional_webauthn_verifier::WebAuthnVerifier;
use p256::ecdsa::{signature::hazmat::PrehashSigner, Signature, SigningKey};
use rand_core::OsRng;
use soroban_sdk::{
    contract, contractimpl, symbol_short,
    testutils::Ledger,
    vec, xdr,
    xdr::{ToXdr, WriteXdr},
    Bytes, IntoVal, Symbol, TryFromVal, Val,
};
use stellar_accounts::verifiers::{utils::base64_url_encode, webauthn::WebAuthnSigData};

const RP: &[u8] = b"vault.example";
const ORIGIN: &str = "https://vault.example";

#[cfg(feature = "wasm-tests")]
const ACCOUNT_WASM: &[u8] =
    include_bytes!("../../../target/wasm32v1-none/release/institutional_account.wasm");
#[cfg(feature = "wasm-tests")]
const VERIFIER_WASM: &[u8] =
    include_bytes!("../../../target/wasm32v1-none/release/institutional_webauthn_verifier.wasm");

fn register_account(e: &Env, signers: InstitutionalSigners, verifier: Address) -> Address {
    #[cfg(feature = "wasm-tests")]
    return e.register(ACCOUNT_WASM, (signers, verifier));
    #[cfg(not(feature = "wasm-tests"))]
    e.register(InstitutionalAccount, (signers, verifier))
}

// A stateful target proves failed authorizations cannot produce side effects.
#[contract]
struct Target;
#[contractimpl]
impl Target {
    pub fn put(e: Env, account: Address, amount: u32) {
        account.require_auth();
        e.storage()
            .instance()
            .set(&symbol_short!("amount"), &amount);
    }
    pub fn get(e: Env) -> u32 {
        e.storage()
            .instance()
            .get(&symbol_short!("amount"))
            .unwrap_or(0)
    }
}

fn public_key(e: &Env, key: &SigningKey) -> BytesN<65> {
    BytesN::from_array(
        e,
        key.verifying_key()
            .to_encoded_point(false)
            .as_bytes()
            .try_into()
            .unwrap(),
    )
}
fn roles(e: &Env, keys: &[SigningKey; 3]) -> InstitutionalSigners {
    InstitutionalSigners {
        ceo: public_key(e, &keys[0]),
        cfo: public_key(e, &keys[1]),
        treasury_manager: public_key(e, &keys[2]),
    }
}

struct Fixture {
    e: Env,
    keys: [SigningKey; 3],
    verifier: Address,
    account: Address,
    target: Address,
}
impl Fixture {
    fn new() -> Self {
        let e = Env::default();
        e.ledger().set_sequence_number(10);
        // Explicitly use Testnet's network domain even in the offline host.
        let network = e
            .crypto()
            .sha256(&Bytes::from_slice(&e, b"Test SDF Network ; September 2015"));
        e.ledger().set_network_id(network.to_array());
        let keys = core::array::from_fn(|_| SigningKey::random(&mut OsRng));
        #[cfg(feature = "wasm-tests")]
        let verifier_code = VERIFIER_WASM;
        #[cfg(not(feature = "wasm-tests"))]
        let verifier_code = WebAuthnVerifier;
        let verifier = e.register(
            verifier_code,
            (
                Bytes::from_slice(&e, RP),
                Bytes::from_slice(&e, ORIGIN.as_bytes()),
            ),
        );
        let account = register_account(&e, roles(&e, &keys), verifier.clone());
        let target = e.register(Target, ());
        Self {
            e,
            keys,
            verifier,
            account,
            target,
        }
    }
    fn client(&self) -> InstitutionalAccountClient<'_> {
        InstitutionalAccountClient::new(&self.e, &self.account)
    }
    fn put_args(&self, amount: u32) -> Vec<Val> {
        (self.account.clone(), amount).into_val(&self.e)
    }
    fn invocation(
        &self,
        contract: &Address,
        name: &str,
        args: Vec<Val>,
    ) -> xdr::SorobanAuthorizedInvocation {
        xdr::SorobanAuthorizedInvocation {
            function: xdr::SorobanAuthorizedFunction::ContractFn(xdr::InvokeContractArgs {
                contract_address: contract.try_into().unwrap(),
                function_name: name.try_into().unwrap(),
                args: args.try_into().unwrap(),
            }),
            sub_invocations: std::vec![].try_into().unwrap(),
        }
    }
    fn put_invocation(&self, amount: u32) -> xdr::SorobanAuthorizedInvocation {
        self.invocation(&self.target, "put", self.put_args(amount))
    }
    fn assertion(
        &self,
        key: &SigningKey,
        digest: [u8; 32],
        origin: &str,
        rp: &[u8],
        flags: u8,
    ) -> Bytes {
        let e = &self.e;
        let mut challenge = [0; 43];
        base64_url_encode(&mut challenge, &digest);
        let challenge = std::str::from_utf8(&challenge).unwrap();
        let client_json = std::format!(
            r#"{{"type":"webauthn.get","challenge":"{challenge}","origin":"{origin}","crossOrigin":false}}"#
        );
        let client_data = Bytes::from_slice(e, client_json.as_bytes());
        let mut authenticator_data = e
            .crypto()
            .sha256(&Bytes::from_slice(e, rp))
            .to_bytes()
            .to_bytes();
        authenticator_data.push_back(flags);
        authenticator_data.extend_from_array(&[0; 4]);
        let mut message = authenticator_data.clone();
        message.append(&e.crypto().sha256(&client_data).to_bytes().to_bytes());
        let signature: Signature = key
            .sign_prehash(&e.crypto().sha256(&message).to_array())
            .unwrap();
        let signature = signature.normalize_s().unwrap_or(signature);
        WebAuthnSigData {
            signature: BytesN::from_array(e, &signature.to_bytes().into()),
            authenticator_data,
            client_data,
        }
        .to_xdr(e)
    }
    fn entry(
        &self,
        invocation: xdr::SorobanAuthorizedInvocation,
        nonce: i64,
        rule: u32,
        keys: &[&SigningKey],
        origin: &str,
        rp: &[u8],
        flags: u8,
    ) -> xdr::SorobanAuthorizationEntry {
        let e = &self.e;
        let preimage =
            xdr::HashIdPreimage::SorobanAuthorization(xdr::HashIdPreimageSorobanAuthorization {
                network_id: xdr::Hash(e.ledger().network_id().to_array()),
                nonce,
                signature_expiration_ledger: 100,
                invocation: invocation.clone(),
            });
        let payload = e.crypto().sha256(&Bytes::from_slice(
            e,
            &preimage.to_xdr(xdr::Limits::none()).unwrap(),
        ));
        let rule_ids = vec![e, rule];
        let mut data = payload.to_bytes().to_bytes();
        data.append(&rule_ids.clone().to_xdr(e));
        let digest = e.crypto().sha256(&data).to_array();
        let mut signers = Map::new(e);
        for key in keys {
            signers.set(
                Signer::External(self.verifier.clone(), public_key(e, key).to_bytes()),
                self.assertion(key, digest, origin, rp, flags),
            );
        }
        let signature: Val = AuthPayload {
            signers,
            context_rule_ids: rule_ids,
        }
        .into_val(e);
        xdr::SorobanAuthorizationEntry {
            credentials: xdr::SorobanCredentials::Address(xdr::SorobanAddressCredentials {
                address: (&self.account).try_into().unwrap(),
                nonce,
                signature_expiration_ledger: 100,
                signature: xdr::ScVal::try_from_val(e, &signature).unwrap(),
            }),
            root_invocation: invocation,
        }
    }
    fn valid_entry(
        &self,
        nonce: i64,
        rule: u32,
        keys: &[&SigningKey],
    ) -> xdr::SorobanAuthorizationEntry {
        self.entry(self.put_invocation(7), nonce, rule, keys, ORIGIN, RP, 5)
    }
    fn put(&self, entry: xdr::SorobanAuthorizationEntry, amount: u32) -> bool {
        self.e.set_auths(&[entry]);
        TargetClient::new(&self.e, &self.target)
            .try_put(&self.account, &amount)
            .is_ok()
    }
    fn assert_unchanged(&self) {
        assert_eq!(TargetClient::new(&self.e, &self.target).get(), 0);
    }
}

#[test]
fn valid_two_of_three_every_pair_and_all_three() {
    for (rule, members) in [
        (0, std::vec![0, 1]),
        (1, std::vec![0, 2]),
        (2, std::vec![1, 2]),
        (3, std::vec![0, 1, 2]),
    ] {
        let f = Fixture::new();
        let keys: std::vec::Vec<_> = members.iter().map(|i| &f.keys[*i]).collect();
        assert!(f.put(f.valid_entry(1, rule, &keys), 7));
        assert_eq!(TargetClient::new(&f.e, &f.target).get(), 7);
    }
}

#[test]
fn single_signer_rejected_for_every_rule() {
    for rule in 0..4 {
        let f = Fixture::new();
        assert!(!f.put(f.valid_entry(1, rule, &[&f.keys[0]]), 7));
        f.assert_unchanged();
    }
}

#[test]
fn duplicate_approval_counts_once_and_is_rejected() {
    let f = Fixture::new();
    // AuthPayload uses a map: repeated signer insertion replaces an entry.
    assert!(!f.put(f.valid_entry(1, 0, &[&f.keys[0], &f.keys[0]]), 7));
    f.assert_unchanged();
}

#[test]
fn unauthorized_signer_rejected_even_alongside_valid_quorum() {
    let f = Fixture::new();
    let outsider = SigningKey::random(&mut OsRng);
    assert!(!f.put(f.valid_entry(1, 0, &[&f.keys[0], &f.keys[1], &outsider]), 7));
    f.assert_unchanged();
}

#[test]
fn missing_authorization_rejected() {
    let f = Fixture::new();
    f.e.set_auths(&[]);
    assert!(TargetClient::new(&f.e, &f.target)
        .try_put(&f.account, &7)
        .is_err());
    f.assert_unchanged();
}

#[test]
fn replay_of_consumed_nonce_rejected_but_fresh_nonce_succeeds() {
    let f = Fixture::new();
    let entry = f.valid_entry(1, 0, &[&f.keys[0], &f.keys[1]]);
    assert!(f.put(entry.clone(), 7));
    assert!(!f.put(entry, 7));
    assert!(f.put(f.valid_entry(2, 0, &[&f.keys[0], &f.keys[1]]), 7));
}

#[test]
fn changed_operation_rejected_even_if_auth_tree_is_rewritten() {
    let f = Fixture::new();
    let mut entry = f.valid_entry(1, 0, &[&f.keys[0], &f.keys[1]]);
    entry.root_invocation = f.put_invocation(8);
    assert!(!f.put(entry, 8));
    f.assert_unchanged();
}

#[test]
fn changed_nonce_and_expiration_rejected() {
    for change_expiry in [false, true] {
        let f = Fixture::new();
        let mut entry = f.valid_entry(1, 0, &[&f.keys[0], &f.keys[1]]);
        if let xdr::SorobanCredentials::Address(ref mut credentials) = entry.credentials {
            if change_expiry {
                credentials.signature_expiration_ledger = 99;
            } else {
                credentials.nonce = 2;
            }
        }
        assert!(!f.put(entry, 7));
        f.assert_unchanged();
    }
}

#[test]
fn expired_authorization_rejected() {
    let f = Fixture::new();
    let entry = f.valid_entry(1, 0, &[&f.keys[0], &f.keys[1]]);
    f.e.ledger().set_sequence_number(101);
    assert!(!f.put(entry, 7));
    f.assert_unchanged();
}

#[test]
fn wrong_network_rejected() {
    let f = Fixture::new();
    let entry = f.valid_entry(1, 0, &[&f.keys[0], &f.keys[1]]);
    f.e.ledger().set_network_id([42; 32]);
    assert!(!f.put(entry, 7));
    f.assert_unchanged();
}

#[test]
fn webauthn_wrong_origin_rp_presence_and_verification_rejected() {
    for (origin, rp, flags) in [
        ("https://evil.example", RP, 5),
        (ORIGIN, b"evil.example".as_slice(), 5),
        (ORIGIN, RP, 1),
        (ORIGIN, RP, 4),
    ] {
        let f = Fixture::new();
        let entry = f.entry(
            f.put_invocation(7),
            1,
            0,
            &[&f.keys[0], &f.keys[1]],
            origin,
            rp,
            flags,
        );
        assert!(!f.put(entry, 7));
        f.assert_unchanged();
    }
}

#[test]
fn invalid_p256_signature_rejected() {
    let f = Fixture::new();
    let mut entry = f.valid_entry(1, 0, &[&f.keys[0], &f.keys[1]]);
    if let xdr::SorobanCredentials::Address(ref mut credentials) = entry.credentials {
        let mut payload = AuthPayload::try_from_val(&f.e, &credentials.signature).unwrap();
        let signer = payload.signers.keys().get(0).unwrap();
        let signature = payload.signers.get(signer.clone()).unwrap();
        let mut assertion =
            <WebAuthnSigData as soroban_sdk::xdr::FromXdr>::from_xdr(&f.e, &signature).unwrap();
        assertion.signature = BytesN::from_array(&f.e, &[0; 64]);
        payload.signers.set(signer, assertion.to_xdr(&f.e));
        let value: Val = payload.into_val(&f.e);
        credentials.signature = xdr::ScVal::try_from_val(&f.e, &value).unwrap();
    }
    assert!(!f.put(entry, 7));
    f.assert_unchanged();
}

#[test]
fn admin_rotation_requires_old_quorum_and_invalidates_old_rules() {
    let f = Fixture::new();
    let new_keys = core::array::from_fn(|_| SigningKey::random(&mut OsRng));
    let new_roles = roles(&f.e, &new_keys);
    let invocation = f.invocation(
        &f.account,
        "rotate_signers",
        (new_roles.clone(),).into_val(&f.e),
    );
    let single = f.entry(invocation.clone(), 1, 0, &[&f.keys[0]], ORIGIN, RP, 5);
    f.e.set_auths(&[single]);
    assert!(f.client().try_rotate_signers(&new_roles).is_err());
    assert_eq!(f.client().signers(), roles(&f.e, &f.keys));
    let outstanding = f.valid_entry(3, 0, &[&f.keys[0], &f.keys[1]]);
    let quorum = f.entry(invocation, 2, 0, &[&f.keys[0], &f.keys[1]], ORIGIN, RP, 5);
    f.e.set_auths(&[quorum]);
    f.client().rotate_signers(&new_roles);
    assert_eq!(f.client().signers(), new_roles);
    assert_eq!(f.client().rule_ids(), vec![&f.e, 4, 5, 6, 7]);
    assert!(!f.put(outstanding, 7));
    assert!(f.put(f.valid_entry(4, 4, &[&new_keys[0], &new_keys[1]]), 7));
}

#[test]
fn duplicate_role_rotation_rejected_and_state_preserved() {
    let f = Fixture::new();
    let mut duplicates = roles(&f.e, &f.keys);
    duplicates.cfo = duplicates.ceo.clone();
    let invocation = f.invocation(
        &f.account,
        "rotate_signers",
        (duplicates.clone(),).into_val(&f.e),
    );
    let entry = f.entry(invocation, 1, 0, &[&f.keys[0], &f.keys[1]], ORIGIN, RP, 5);
    f.e.set_auths(&[entry]);
    assert!(f.client().try_rotate_signers(&duplicates).is_err());
    assert_eq!(f.client().signers(), roles(&f.e, &f.keys));
    assert!(f.put(f.valid_entry(2, 0, &[&f.keys[0], &f.keys[1]]), 7));
}

#[test]
fn execute_entry_point_requires_quorum_and_binds_target_arguments() {
    let f = Fixture::new();
    let args = f.put_args(7);
    let execute_args: Vec<Val> =
        (f.target.clone(), Symbol::new(&f.e, "put"), args.clone()).into_val(&f.e);
    let invocation = f.invocation(&f.account, "execute", execute_args);
    let single = f.entry(invocation.clone(), 1, 0, &[&f.keys[0]], ORIGIN, RP, 5);
    f.e.set_auths(&[single]);
    assert!(f
        .client()
        .try_execute(&f.target, &Symbol::new(&f.e, "put"), &args)
        .is_err());
    f.assert_unchanged();
    let quorum = f.entry(invocation, 2, 0, &[&f.keys[0], &f.keys[1]], ORIGIN, RP, 5);
    f.e.set_auths(&[quorum]);
    f.client()
        .execute(&f.target, &Symbol::new(&f.e, "put"), &args);
    assert_eq!(TargetClient::new(&f.e, &f.target).get(), 7);
}

impl Fixture {
    /// Re-sign mutated assertions so binding failures cannot be attributed only
    /// to invalid P-256 signatures.
    fn mutate_assertions(
        &self,
        entry: &mut xdr::SorobanAuthorizationEntry,
        mutate: impl Fn(&mut WebAuthnSigData),
    ) {
        use soroban_sdk::xdr::FromXdr;
        if let xdr::SorobanCredentials::Address(ref mut credentials) = entry.credentials {
            let mut payload = AuthPayload::try_from_val(&self.e, &credentials.signature).unwrap();
            for (signer, encoded) in payload.signers.clone() {
                let mut assertion = WebAuthnSigData::from_xdr(&self.e, &encoded).unwrap();
                mutate(&mut assertion);
                let Signer::External(_, ref public) = signer else {
                    unreachable!()
                };
                let key = self
                    .keys
                    .iter()
                    .find(|key| public_key(&self.e, key).to_bytes() == *public)
                    .unwrap();
                let mut message = assertion.authenticator_data.clone();
                message.append(
                    &self
                        .e
                        .crypto()
                        .sha256(&assertion.client_data)
                        .to_bytes()
                        .to_bytes(),
                );
                let signature: Signature = key
                    .sign_prehash(&self.e.crypto().sha256(&message).to_array())
                    .unwrap();
                let signature = signature.normalize_s().unwrap_or(signature);
                assertion.signature = BytesN::from_array(&self.e, &signature.to_bytes().into());
                payload.signers.set(signer, assertion.to_xdr(&self.e));
            }
            let value: Val = payload.into_val(&self.e);
            credentials.signature = xdr::ScVal::try_from_val(&self.e, &value).unwrap();
        }
    }
}

#[test]
fn signed_wrong_challenge_type_and_cross_origin_rejected() {
    for mode in 0..6 {
        let f = Fixture::new();
        let mut entry = f.valid_entry(1, 0, &[&f.keys[0], &f.keys[1]]);
        f.mutate_assertions(&mut entry, |assertion| {
            let mut json = std::string::String::from_utf8(
                assertion
                    .client_data
                    .to_buffer::<1024>()
                    .as_slice()
                    .to_vec(),
            )
            .unwrap();
            match mode {
                0 => {
                    let start = json.find("\"challenge\":\"").unwrap() + "\"challenge\":\"".len();
                    let end = start + 43;
                    json.replace_range(start..end, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
                }
                1 => json = json.replace("webauthn.get", "webauthn.create"),
                2 => json = json.replace("\"crossOrigin\":false", "\"crossOrigin\":true"),
                3 => {
                    json = json.replace(
                        "\"crossOrigin\":false",
                        "\"crossOrigin\":false,\"topOrigin\":\"https://vault.example\"",
                    )
                }
                4 => json.push_str("{}"),
                5 => {
                    json = json.replace(
                        "\"crossOrigin\":false",
                        "\"crossOrigin\":false,\"origin\":\"https://vault.example\"",
                    )
                }
                _ => unreachable!(),
            }
            assertion.client_data = Bytes::from_slice(&f.e, json.as_bytes());
        });
        assert!(!f.put(entry, 7), "mode {mode}");
        f.assert_unchanged();
    }
}

#[test]
fn rule_selection_is_bound_to_signatures() {
    let f = Fixture::new();
    let mut entry = f.valid_entry(1, 3, &[&f.keys[0], &f.keys[1], &f.keys[2]]);
    if let xdr::SorobanCredentials::Address(ref mut credentials) = entry.credentials {
        let mut payload = AuthPayload::try_from_val(&f.e, &credentials.signature).unwrap();
        payload.context_rule_ids = vec![&f.e, 0];
        payload.signers.remove(Signer::External(
            f.verifier.clone(),
            public_key(&f.e, &f.keys[2]).to_bytes(),
        ));
        let value: Val = payload.into_val(&f.e);
        credentials.signature = xdr::ScVal::try_from_val(&f.e, &value).unwrap();
    }
    assert!(!f.put(entry, 7));
    f.assert_unchanged();
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn duplicate_initial_roles_rejected() {
    let f = Fixture::new();
    let mut duplicated = roles(&f.e, &f.keys);
    duplicated.treasury_manager = duplicated.ceo.clone();
    register_account(&f.e, duplicated, f.verifier.clone());
}

#[test]
fn initialization_and_immutable_verifier_configuration() {
    use institutional_webauthn_verifier::WebAuthnVerifierClient;
    let f = Fixture::new();
    assert_eq!(f.client().signers(), roles(&f.e, &f.keys));
    assert_eq!(f.client().rule_ids(), vec![&f.e, 0, 1, 2, 3]);
    let verifier = WebAuthnVerifierClient::new(&f.e, &f.verifier);
    assert_eq!(
        verifier.origin(),
        Bytes::from_slice(&f.e, ORIGIN.as_bytes())
    );
    assert_eq!(
        verifier.rp_id_hash(),
        f.e.crypto().sha256(&Bytes::from_slice(&f.e, RP)).to_bytes()
    );
    // The host must reject constructor calls after atomic initialization.
    assert!(f
        .e
        .try_invoke_contract::<(), soroban_sdk::Error>(
            &f.verifier,
            &Symbol::new(&f.e, "__constructor"),
            (
                Bytes::from_slice(&f.e, b"evil.example"),
                Bytes::from_slice(&f.e, b"https://evil.example")
            )
                .into_val(&f.e)
        )
        .is_err());
    assert_eq!(
        verifier.origin(),
        Bytes::from_slice(&f.e, ORIGIN.as_bytes())
    );
}

#[test]
fn authorized_asset_transfer_and_resource_measurement() {
    use soroban_sdk::{testutils::Address as _, token};
    let f = Fixture::new();
    let admin = Address::generate(&f.e);
    let recipient = Address::generate(&f.e);
    let asset = f.e.register_stellar_asset_contract_v2(admin.clone());
    let token = token::TokenClient::new(&f.e, &asset.address());
    // Only the fixture's mint is mocked; transfer authorization is real.
    token::StellarAssetClient::new(&f.e, &asset.address())
        .mock_auths(&[soroban_sdk::testutils::MockAuth {
            address: &admin,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &asset.address(),
                fn_name: "mint",
                args: (f.account.clone(), 100i128).into_val(&f.e),
                sub_invokes: &[],
            },
        }])
        .mint(&f.account, &100);
    let invocation = f.invocation(
        &asset.address(),
        "transfer",
        (f.account.clone(), recipient.clone(), 7i128).into_val(&f.e),
    );
    let entry = f.entry(invocation, 1, 0, &[&f.keys[0], &f.keys[1]], ORIGIN, RP, 5);
    f.e.set_auths(&[entry]);
    f.e.cost_estimate().budget().reset_default();
    token.transfer(&f.account, &recipient, &7);
    std::println!("asset transfer cost: {}", f.e.cost_estimate().budget());
    assert_eq!(token.balance(&f.account), 93);
    assert_eq!(token.balance(&recipient), 7);
}

#[cfg(feature = "wasm-tests")]
#[test]
fn official_javascript_sdk_authorization_executes_compiled_wasm() {
    let lines: std::vec::Vec<_> = include_str!("../../../scripts/testnet/sdk-auth-vector.txt")
        .lines()
        .collect();
    let decode = |s: &str| -> std::vec::Vec<u8> {
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
            .collect()
    };
    let e = Env::default();
    e.ledger().set_sequence_number(10);
    let network = e
        .crypto()
        .sha256(&Bytes::from_slice(&e, b"Test SDF Network ; September 2015"));
    e.ledger().set_network_id(network.to_array());
    let account = Address::from_str(&e, lines[0]);
    let verifier = Address::from_str(&e, lines[1]);
    let target = Address::from_str(&e, lines[2]);
    let signers = InstitutionalSigners {
        ceo: BytesN::from_array(&e, &decode(lines[3]).try_into().unwrap()),
        cfo: BytesN::from_array(&e, &decode(lines[4]).try_into().unwrap()),
        treasury_manager: BytesN::from_array(&e, &decode(lines[5]).try_into().unwrap()),
    };
    e.register_at(
        &verifier,
        VERIFIER_WASM,
        (
            Bytes::from_slice(&e, RP),
            Bytes::from_slice(&e, ORIGIN.as_bytes()),
        ),
    );
    e.register_at(&account, ACCOUNT_WASM, (signers, verifier));
    e.register_at(&target, Target, ());
    use xdr::ReadXdr;
    let entry =
        xdr::SorobanAuthorizationEntry::from_xdr(&decode(lines[6]), xdr::Limits::none()).unwrap();
    e.set_auths(&[entry.clone()]);
    TargetClient::new(&e, &target).put(&account, &7);
    assert_eq!(TargetClient::new(&e, &target).get(), 7);
    e.set_auths(&[entry]);
    assert!(TargetClient::new(&e, &target)
        .try_put(&account, &7)
        .is_err());
}
