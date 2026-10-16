import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTestnet, DEFAULT_ACCOUNT, validAddress, validAmount, formatXlm } from './domain.ts';
test('direcciones Stellar y montos con precisión de stroops', () => { assert.ok(validAddress(DEFAULT_ACCOUNT)); assert.equal(validAddress('C_INVALID'), false); for (const x of ['0', '-1', '1e2', '0.00000001', '', '1.2.3'])
    assert.equal(validAmount(x), false, x); for (const x of ['1', '0.0000001', '12.3456789'])
    assert.ok(validAmount(x), x); });
test('balance exacto sin pérdida de precisión', () => { assert.equal(formatXlm(0n), '0.0000000'); assert.equal(formatXlm(1234567890123456789n), '123456789012.3456789'); });

test("rechaza Mainnet y redes desconocidas antes de consultar la cuenta", () => {
    assert.doesNotThrow(() => assertTestnet("Test SDF Network ; September 2015"));
    assert.throws(() => assertTestnet("Public Global Stellar Network ; September 2015"));
    assert.throws(() => assertTestnet(""));
});
