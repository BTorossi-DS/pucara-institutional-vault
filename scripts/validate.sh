#!/usr/bin/env bash
set -euo pipefail
cd /workspaces/stellar-wallet
source .tools/env.sh
stellar contract build --locked
cargo build --locked -p institutional-account --example normalize_assertion
cargo fmt --all -- --check
cargo check --workspace --all-targets --locked
cargo test --workspace --locked
cargo test --workspace --locked --features institutional-account/wasm-tests
npm run typecheck
npm test
sha256sum target/wasm32v1-none/release/institutional_account.wasm target/wasm32v1-none/release/institutional_webauthn_verifier.wasm
