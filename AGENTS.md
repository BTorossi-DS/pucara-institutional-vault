# Stellar Wallet — NEATech Hackathon

## Project

Build a non-custodial Stellar wallet using
passkeys and Soroban smart accounts.

The application will eventually integrate
with Blend V2 for USDC lending.

## Security Rules

1. Use Stellar Testnet only.
2. Never use real funds.
3. Never request or expose seed phrases.
4. Never store user private keys.
5. Never commit secrets or credentials.
6. Never disable TLS verification.
7. Never bypass authentication.
8. Never implement custom cryptography.
9. Never execute destructive commands
   without explicit user approval.
10. Never request elevated execution
    permissions without explaining why.

## Execution Environment

All development must occur inside:

/workspaces/stellar-wallet

Do not access files outside this workspace
unless explicitly authorized.

Do not modify Docker configuration,
host settings, or system security policies.

## Dependencies

Use official Stellar SDKs whenever possible.

Verify package versions and APIs before
implementing integrations.

Do not install unverified dependencies.

## Smart Wallet

Use passkeys for transaction authorization.

Prefer established smart account contracts.

Do not implement custom account contracts
unless necessary.

## Backend

Never expose backend secrets to the frontend.

Never allow the backend to authorize
user transactions unilaterally.

## Development Workflow

1. Explain the implementation plan.
2. Implement one milestone at a time.
3. Run TypeScript checks.
4. Run relevant tests.
5. Report security considerations.
6. Wait for approval before major changes.

## Important

If the sandbox fails, stop and report the
error instead of automatically retrying
with elevated permissions.