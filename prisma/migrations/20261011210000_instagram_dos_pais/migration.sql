-- Migração só de dados: preenche os perfis públicos do Instagram do pai e da mãe, informados pelo
-- dono em 2026-10-11. Só preenche campo vazio, para não sobrescrever o que for salvo no painel.
UPDATE "Campaign"
SET "instagramFather" = 'https://www.instagram.com/abnersenna_/'
WHERE "instagramFather" = '';

UPDATE "Campaign"
SET "instagramMother" = 'https://www.instagram.com/bellasenna__/'
WHERE "instagramMother" = '';
