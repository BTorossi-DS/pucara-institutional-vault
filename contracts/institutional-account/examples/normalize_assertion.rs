//! DER-to-compact, low-S encoding using the existing RustCrypto dependency.
//! Public assertion data only; no keys or signing operations.
use p256::ecdsa::Signature;
fn main() {
    let input = std::env::args().nth(1).expect("DER signature hex required");
    assert!(input.len() % 2 == 0 && input.len() <= 144);
    let bytes: Vec<u8> = (0..input.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&input[i..i + 2], 16).expect("hex"))
        .collect();
    let sig = Signature::from_der(&bytes).expect("P-256 DER signature");
    let sig = sig.normalize_s().unwrap_or(sig);
    for byte in sig.to_bytes() {
        print!("{byte:02x}");
    }
    println!();
}
