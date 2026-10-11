-- Migração só de dados: troca a descrição antiga do produto de números (texto de demonstração)
-- pela descrição definitiva. Só altera linhas cuja descrição é exatamente a frase antiga,
-- para não sobrescrever um texto que o dono tenha editado.
UPDATE "Product"
SET "description" = 'Cestas masculina e feminina. Cada R$ 5 dão 10 números para o sorteio.'
WHERE "description" = 'Cestas masculina e feminina. Seleção de números em uma demonstração sem cobrança ou sorteio real.';
