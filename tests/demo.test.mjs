import test from 'node:test';
import assert from 'node:assert/strict';
import { demoTotals, effectiveStatus, emptyDemo, parseDemo, transition, numberAllowance, validateOrder, occupiedNumbers, assertNumbersAvailable, randomAvailableNumbers, TOTAL_NUMBERS } from '../src/lib/demo-model.ts';
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

test('pacotes seguem R$ 5 para 10 números e exigem seleção exata', () => {
  for (const [amount,count] of [[500,10],[1000,20],[2500,50],[5000,100]]) assert.equal(numberAllowance(amount),count);
  const numbers = Array.from({length:10},(_,i)=>i+1);
  assert.doesNotThrow(()=>validateOrder(500,'numbers',numbers));
  assert.throws(()=>validateOrder(500,'numbers',numbers.slice(1)));
  assert.throws(()=>validateOrder(500,'numbers',[...numbers.slice(1),2]));
  assert.throws(()=>validateOrder(525,'numbers',numbers));
  assert.throws(()=>validateOrder(500,'numbers',[...numbers.slice(1),5001]));
  assert.throws(()=>validateOrder(500,'numbers',[...numbers.slice(1),0]));
});
test('colaboração avulsa aceita centavos e nunca inclui números', () => {
  assert.doesNotThrow(()=>validateOrder(7525,'extra',[]));
  assert.throws(()=>validateOrder(499,'extra',[]));
  assert.throws(()=>validateOrder(7525,'extra',[1]));
});
test('reserva é liberada na expiração ou estorno e confirmação mantém ocupação', () => {
  const numbered = {...payment,mode:'numbers',numbers:Array.from({length:10},(_,i)=>i+1)};
  const sample = {...emptyDemo,payments:[numbered]};
  assert.equal(occupiedNumbers(sample,2000).size,10);
  assert.throws(()=>assertNumbersAvailable(sample,[1],2000));
  assert.equal(occupiedNumbers(sample,601000).size,0);
  const approved = transition(sample,numbered.id,'approved',2000);
  assert.equal(occupiedNumbers(approved,900000).size,10);
  assert.equal(occupiedNumbers(transition(approved,numbered.id,'refunded',3000),4000).size,0);
});
test('dados antigos são migrados para avulsa e catálogo não duplica por pedido', () => {
  const restored = parseDemo(JSON.stringify(data));
  assert.equal(restored.payments[0].mode,'extra');
  assert.equal(restored.payments[0].productId,'colaboracao-avulsa');
  assert.equal(restored.products.length,2);
  const numbered = {...payment,id:'demo-numbers',amount:500,mode:'numbers',numbers:Array.from({length:10},(_,i)=>i+101),productId:'forjado'};
  const refreshed = parseDemo(JSON.stringify({...data,payments:[numbered,payment],products:[{id:'malicioso'}]}));
  assert.equal(refreshed.products.length,2);
  assert.equal(refreshed.payments[0].productId,'cestas-boticario');
  assert.deepEqual(refreshed.payments[0].numbers,numbered.numbers);
});
test('aprovação de reserva conflitante falha e pedido inválido não é carregado', () => {
  const numbers=Array.from({length:10},(_,i)=>i+1);
  const a={...payment,id:'demo-a',amount:500,mode:'numbers',numbers};
  const b={...a,id:'demo-b'};
  assert.throws(()=>transition({...emptyDemo,payments:[a,b]},a.id,'approved',2000));
  assert.equal(parseDemo(JSON.stringify({...data,payments:[{...a,numbers:[1]}]})).payments.length,0);
});

test('seleção aleatória entrega quantidade exata, sem repetição nem números ocupados', () => {
  const occupied = new Set([1,2,3,4,5,101,5000]);
  const chosen = randomAvailableNumbers(20,occupied,()=>.72);
  assert.equal(chosen.length,20);
  assert.equal(new Set(chosen).size,20);
  assert.ok(chosen.every(number=>number>=1 && number<=TOTAL_NUMBERS && !occupied.has(number)));
  assert.notDeepEqual(chosen,Array.from({length:20},(_,i)=>i+6));
  const onlyThreeFree = new Set(Array.from({length:TOTAL_NUMBERS-3},(_,i)=>i+1));
  assert.deepEqual(randomAvailableNumbers(3,onlyThreeFree,()=>0),[4998,4999,5000]);
  assert.throws(()=>randomAvailableNumbers(4,onlyThreeFree));
});
