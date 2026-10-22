-- Asegura dos catalogos del sistema: el rol 'maestro' y el tipo de identificacion 'cedula'.
--
-- No inserta ningun usuario: la aplicacion nace sin usuarios. El primero, el superadmin,
-- llega con SL-32; hasta entonces, los tests crean sus usuarios en el propio test.
--
-- Los catalogos tambien se siembran por script (`pnpm run db:seed`,
-- scripts/seed-catalogos.ts), pero esta migracion puede correr ANTES de ese script y
-- es la unica que inserta 'cedula'. Por eso los asegura aqui, de forma idempotente.
--
-- El nombre de la carpeta se conserva para no mover el orden ni el identificador de la
-- migracion (SL-11, edicion en sitio: no habia ninguna base desplegada).

-- Catalogo: rol 'maestro'
INSERT INTO "rol" ("id", "value")
VALUES (gen_random_uuid()::text, 'maestro'::rol_value)
ON CONFLICT ("value") DO NOTHING;

-- Catalogo: tipo_identificacion 'cedula'
INSERT INTO "tipo_identificacion" ("id", "value")
VALUES (gen_random_uuid()::text, 'cedula')
ON CONFLICT ("value") DO NOTHING;
