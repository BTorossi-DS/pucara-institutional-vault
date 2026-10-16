import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attempt } from './stellar.ts';
test('una consulta fallida no se convierte en un balance ni expone errores internos', async () => { const result = await attempt(async () => { throw Error('internal provider detail'); }); assert.equal(result.value, undefined); assert.ok(result.error); assert.equal(result.error.includes('internal provider detail'), false); });
test('un balance real de cero se conserva como dato válido', async () => { assert.deepEqual(await attempt(async () => '0'), { value: '0' }); });
