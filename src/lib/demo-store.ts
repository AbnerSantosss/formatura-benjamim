'use client';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { DemoData, DemoStatus, OrderMode, assertNumbersAvailable, emptyDemo, parseDemo, productFor, transition, validateOrder } from './demo-model';

const KEY = 'benjamim.frontend-demo.v1';
const AUTH = 'benjamim.frontend-demo.session';
const EVENT = 'benjamim-demo-change';
// Public prototype credentials. Never use this as production authentication.
export const demoLogin = { username: 'admin', password: 'benjamim123' };
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(EVENT, callback);
  return () => { window.removeEventListener('storage', callback); window.removeEventListener(EVENT, callback); };
}
function read() { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } }
function session() { try { return sessionStorage.getItem(AUTH) || ''; } catch { return ''; } }
const serverSnapshot = () => null;
export function useDemo() {
  const raw = useSyncExternalStore(subscribe, read, serverSnapshot);
  const data = useMemo(() => parseDemo(raw), [raw]);
  return { data, ready: raw !== null };
}
export function useDemoSession() { return useSyncExternalStore(subscribe, session, serverSnapshot); }
export function useDemoClock() {
  const [now, setNow] = useState(0);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return now;
}
function write(data: DemoData) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); window.dispatchEvent(new Event(EVENT)); }
  catch { throw new Error('O navegador bloqueou o armazenamento local. Permita o armazenamento para testar a demonstração.'); }
}
export function createDemoPayment(amount: number, mode: OrderMode = 'extra', numbers: number[] = []) {
  validateOrder(amount, mode, numbers);
  const data = parseDemo(read());
  if (data.payments.length >= 1000) throw new Error('Limite de 1.000 pedidos de teste atingido. Limpe os testes no painel.');
  const id = `demo-${crypto.randomUUID()}`;
  const createdAt = Date.now();
  assertNumbersAvailable(data, numbers, createdAt);
  write({ ...data, payments: [{ id, amount, mode, productId: productFor(mode).id, numbers: [...numbers].sort((a,b) => a-b), createdAt, expiresAt: createdAt + 600000, status: 'pending' }, ...data.payments] });
  return id;
}
export function changeDemoStatus(id: string, next: DemoStatus) { write(transition(parseDemo(read()), id, next, Date.now())); }
export function saveDemoGoal(goal: number) {
  if (!Number.isSafeInteger(goal) || goal < 100 || goal > 100000000) throw new Error('Informe uma meta entre R$ 1 e R$ 1.000.000.');
  write({ ...parseDemo(read()), goal });
}
export function resetDemo() { write(emptyDemo); }
export function signInDemo(username: string, password: string) {
  if (username !== demoLogin.username || password !== demoLogin.password) return false;
  try { sessionStorage.setItem(AUTH, 'demo'); window.dispatchEvent(new Event(EVENT)); return true; }
  catch { throw new Error('Permita o armazenamento de sessão no navegador para entrar.'); }
}
export function signOutDemo() { sessionStorage.removeItem(AUTH); window.dispatchEvent(new Event(EVENT)); }
