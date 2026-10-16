#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, xdr::FromXdr, Bytes,
    BytesN, Env, Vec,
};
use stellar_accounts::verifiers::{
    webauthn::{self, WebAuthnSigData},
    Verifier,
};

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Origin,
    RpHash,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    InvalidConfiguration = 1,
    InvalidKey = 2,
    InvalidAssertion = 3,
    WrongOrigin = 4,
    WrongRpId = 5,
    CrossOrigin = 6,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Binding<'a> {
    origin: &'a str,
    cross_origin: Option<bool>,
    top_origin: Option<&'a str>,
}

/// Immutable RP/origin binding around OpenZeppelin's WebAuthn verifier.
/// Deployment must use a reviewed RP ID and exact HTTPS origin.
#[contract]
pub struct WebAuthnVerifier;

#[contractimpl]
impl WebAuthnVerifier {
    pub fn __constructor(e: &Env, rp_id: Bytes, origin: Bytes) {
        if origin.len() > 256 {
            panic_with_error!(e, Error::InvalidConfiguration);
        }
        let origin_buf = origin.to_buffer::<256>();
        let origin_slice = origin_buf.as_slice();
        if rp_id.is_empty()
            || rp_id.len() > 253
            || !origin_slice.starts_with(b"https://")
            || origin_slice.len() <= 8
        {
            panic_with_error!(e, Error::InvalidConfiguration);
        }
        e.storage().instance().set(&DataKey::Origin, &origin);
        e.storage()
            .instance()
            .set(&DataKey::RpHash, &e.crypto().sha256(&rp_id).to_bytes());
    }
    pub fn origin(e: &Env) -> Bytes {
        e.storage().instance().get(&DataKey::Origin).unwrap()
    }

    pub fn rp_id_hash(e: &Env) -> BytesN<32> {
        e.storage().instance().get(&DataKey::RpHash).unwrap()
    }
}

#[contractimpl]
impl Verifier for WebAuthnVerifier {
    type KeyData = Bytes;
    type SigData = Bytes;

    fn verify(e: &Env, signature_payload: Bytes, key_data: Bytes, sig_data: Bytes) -> bool {
        if signature_payload.len() != 32 {
            panic_with_error!(e, Error::InvalidAssertion);
        }
        let key = Self::canonicalize_key(e, key_data);
        let public_key: BytesN<65> = key.try_into().unwrap();
        let assertion = WebAuthnSigData::from_xdr(e, &sig_data)
            .unwrap_or_else(|_| panic_with_error!(e, Error::InvalidAssertion));
        if assertion.authenticator_data.len() < 37 || assertion.client_data.len() > 1024 {
            panic_with_error!(e, Error::InvalidAssertion);
        }
        let expected_rp: BytesN<32> = e.storage().instance().get(&DataKey::RpHash).unwrap();
        if assertion.authenticator_data.slice(0..32) != expected_rp.to_bytes() {
            panic_with_error!(e, Error::WrongRpId);
        }
        let json = assertion.client_data.to_buffer::<1024>();
        let (binding, consumed): (Binding, usize) = serde_json_core::from_slice(json.as_slice())
            .unwrap_or_else(|_| panic_with_error!(e, Error::InvalidAssertion));
        if !json.as_slice()[consumed..]
            .iter()
            .all(u8::is_ascii_whitespace)
        {
            panic_with_error!(e, Error::InvalidAssertion);
        }
        let expected_origin: Bytes = e.storage().instance().get(&DataKey::Origin).unwrap();
        if Bytes::from_slice(e, binding.origin.as_bytes()) != expected_origin {
            panic_with_error!(e, Error::WrongOrigin);
        }
        if binding.cross_origin.unwrap_or(false) || binding.top_origin.is_some() {
            panic_with_error!(e, Error::CrossOrigin);
        }
        webauthn::verify(e, &signature_payload, &public_key, &assertion)
    }

    fn canonicalize_key(e: &Env, key_data: Bytes) -> Bytes {
        // Accept public keys only. Credential IDs are off-chain metadata.
        if key_data.len() != 65 || key_data.get(0) != Some(4) {
            panic_with_error!(e, Error::InvalidKey);
        }
        key_data
    }

    fn batch_canonicalize_key(e: &Env, keys_data: Vec<Bytes>) -> Vec<Bytes> {
        Vec::from_iter(
            e,
            keys_data.iter().map(|key| Self::canonicalize_key(e, key)),
        )
    }
}
