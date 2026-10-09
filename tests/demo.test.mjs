import test from 'node:test';
import assert from 'node:assert/strict';
import { demoTotals, effectiveStatus, emptyDemo, parseDemo, transition } from '../src/lib/demo-model.ts';
const payment = { id:'demo-test-1', amount:2500, createdAt:1000, expiresAt:601000, status:'pending' };
const data = { ...emptyDemo, payments:[payment] };
test('pagamento pendente não entra no total aprovado', () => {
  assert.deepEqual(demoTotals(data,2000), {approved:0,pending:2500,refunded:0,count:0});
});
test('aprovação duplicada não duplica contribuição', () => {
  const approved = transition(transition(data,payment.id,'approved',2000),payment.id,'approved',3000);
  assert.deepEqual(demoTotals(approved,3000),{approved:2500,pending:0,refunded:0,count:1});
  assert.equal(approved.payments.length,1);
});
test('estorno remove o valor aprovado e não pode ser reaprovado', () => {
  const refunded = transition(transition(data,payment.id,'approved',2000),payment.id,'refunded',3000);
  assert.deepEqual(demoTotals(refunded,4000),{approved:0,pending:0,refunded:2500,count:0});
  assert.equal(transition(refunded,payment.id,'approved',5000).payments[0].status,'refunded');
});
test('pagamento expirado não pode ser aprovado', () => {
  assert.equal(effectiveStatus(payment,601000),'expired');
  assert.equal(demoTotals(data,601000).pending,0);
  assert.equal(effectiveStatus(transition(data,payment.id,'approved',601000).payments[0],601000),'expired');
});
test('armazenamento inválido é tratado e campos pessoais não são carregados', () => {
  assert.deepEqual(parseDemo('{broken'),emptyDemo);
  assert.equal(parseDemo(JSON.stringify({...data,payments:[{...payment,amount:-10}]})).payments.length,0);
  const restored = parseDemo(JSON.stringify({...data,payments:[{...payment,cpf:'000',email:'teste@example.com'}]}));
  assert.equal('cpf' in restored.payments[0],false);
  assert.equal('email' in restored.payments[0],false);
});
test('simular expiração é terminal e registro desconhecido não muda os outros', () => {
  const expired = transition(data,payment.id,'expired',2000);
  assert.equal(effectiveStatus(expired.payments[0],3000),'expired');
  assert.deepEqual(transition(data,'demo-inexistente','approved',2000),data);
});
