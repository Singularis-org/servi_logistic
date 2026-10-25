-- SL-36 T1.1 (design §2.1-2.4) — LAS INTEGRACIONES DE CADA EMPRESA Y EL LIMITE DE PRUEBAS.
--
-- UNA tabla para los cuatro servicios (D6): una politica, un repositorio, un recifrado y una
-- lectura de estado para SL-26. Lo propio de cada servicio va en `datos_publicos` (zod por servicio
-- en el repositorio); lo que necesita unico o busqueda (numero de WhatsApp, resumen del token) son
-- columnas reales. Borrado FISICO (D7): desconectar es `DELETE`, asi que los unicos son totales.
--
-- Patron de tabla de negocio de SL-17 / SL-38: `organizacion_id` con el DEFAULT de la transaccion,
-- FK RESTRICT, indice, RLS para `servi_app` y el trigger que impide cambiar de empresa. Sin
-- `verificar_misma_empresa`: ninguna FK apunta a otra tabla de negocio.

CREATE TYPE "servicio_integracion" AS ENUM ('whatsapp', 'google_maps', 'optimizacion_rutas', 'asistente');
CREATE TYPE "estado_integracion" AS ENUM ('conectada', 'error');

-- `id` SIN default (QC inv. 3): el service lo genera ANTES de cifrar, porque el id de la fila va en
-- los datos asociados de cada secreto. Si lo pusiera la base, no habria con que cifrar.
CREATE TABLE "integracion" (
  "id"                            TEXT NOT NULL PRIMARY KEY,
  "organizacion_id"               TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
  "servicio"                      "servicio_integracion" NOT NULL,
  "estado"                        "estado_integracion" NOT NULL,
  "datos_publicos"                JSONB NOT NULL DEFAULT '{}',
  "secretos"                      JSONB NOT NULL,
  "whatsapp_numero_id"            TEXT,
  "whatsapp_resumen_verificacion" CHAR(64),
  "ultimo_error_codigo"           TEXT,
  "ultima_prueba_at"              TIMESTAMP(3),
  "ultimo_webhook_at"             TIMESTAMP(3),
  "created_at"                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Las dos columnas de WhatsApp existen solo en su servicio, y en el siempre: el webhook enruta
  -- por el numero (R20) y verifica por el resumen (R19). Una fila de WhatsApp sin ellas seria una
  -- integracion que nunca recibe nada.
  CONSTRAINT "integracion_whatsapp_numero_solo_en_whatsapp"
    CHECK (("servicio" = 'whatsapp') = ("whatsapp_numero_id" IS NOT NULL)),
  CONSTRAINT "integracion_whatsapp_resumen_solo_en_whatsapp"
    CHECK (("servicio" = 'whatsapp') = ("whatsapp_resumen_verificacion" IS NOT NULL)),
  -- SHA-256 en hex minuscula: nunca el token en claro (R5, QC inv. 4).
  CONSTRAINT "integracion_whatsapp_resumen_hex64"
    CHECK ("whatsapp_resumen_verificacion" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "integracion_datos_publicos_objeto"
    CHECK (jsonb_typeof("datos_publicos") = 'object'),
  -- R5 en la base: cada valor de `secretos` es un texto con la forma completa de la boveda,
  -- `v<n>:<iv 12 bytes>:<tag 16 bytes>:<cifrado>` en base64 estandar. Es la ultima red si un
  -- camino de escritura se salta el cifrador: un backup o un SELECT nunca ve una credencial en
  -- claro. Se exige la forma entera y no solo el prefijo `v<n>:`, porque `v1:` delante de un
  -- token en claro pasaria un CHECK de prefijo. El `type() != "string"` cierra el hueco de
  -- `like_regex`, que sobre un numero o un objeto da «desconocido» y no lo filtraria.
  CONSTRAINT "integracion_secretos_cifrados"
    CHECK (
      jsonb_typeof("secretos") = 'object'
      AND NOT jsonb_path_exists(
        "secretos",
        '$.* ? (@.type() != "string" || !(@ like_regex "^v[1-9][0-9]*:[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]{22}==:(([A-Za-z0-9+/]{4})+([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?|[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)$"))'
      )
    )
);

ALTER TABLE "integracion" ADD CONSTRAINT "integracion_organizacion_id_fkey"
  FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- R10: una integracion por empresa y servicio, tambien con dos altas a la vez. Empieza por
-- organizacion_id, como los unicos de SL-17 T3.9.
CREATE UNIQUE INDEX "integracion_organizacion_id_servicio_key" ON "integracion" ("organizacion_id", "servicio");
-- R11: el numero es unico ENTRE empresas, a proposito (es un id externo, como `api_key.key_hash`):
-- el webhook necesita que un numero lleve a una sola empresa.
CREATE UNIQUE INDEX "integracion_whatsapp_numero_id_key" ON "integracion" ("whatsapp_numero_id");
-- R19: el GET del webhook busca por resumen sin sesion; unico para que lleve a una sola integracion.
CREATE UNIQUE INDEX "integracion_whatsapp_resumen_verificacion_key" ON "integracion" ("whatsapp_resumen_verificacion");
CREATE INDEX "integracion_organizacion_id_idx" ON "integracion" ("organizacion_id");

ALTER TABLE "integracion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integracion_por_empresa" ON "integracion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- Los privilegios por defecto de M1 de SL-17 ya los dan; se repiten por si la migracion la corre otro rol.
GRANT SELECT, INSERT, UPDATE, DELETE ON "integracion" TO servi_app;

CREATE TRIGGER "integracion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "integracion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();

-- Design §6 — el contador de pruebas por empresa y minuto (D4). En la base y no en memoria: en
-- Vercel cada instancia tiene la suya, y N instancias multiplicarian el limite por N.
CREATE TABLE "integracion_prueba_minuto" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
  "minuto"          TIMESTAMPTZ(0) NOT NULL,
  "intentos"        INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE "integracion_prueba_minuto" ADD CONSTRAINT "integracion_prueba_minuto_organizacion_id_fkey"
  FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El `ON CONFLICT (organizacion_id, minuto)` del contador necesita este unico.
CREATE UNIQUE INDEX "integracion_prueba_minuto_organizacion_id_minuto_key"
  ON "integracion_prueba_minuto" ("organizacion_id", "minuto");
CREATE INDEX "integracion_prueba_minuto_organizacion_id_idx" ON "integracion_prueba_minuto" ("organizacion_id");

ALTER TABLE "integracion_prueba_minuto" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integracion_prueba_minuto_por_empresa" ON "integracion_prueba_minuto" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

GRANT SELECT, INSERT, UPDATE, DELETE ON "integracion_prueba_minuto" TO servi_app;

CREATE TRIGGER "integracion_prueba_minuto_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "integracion_prueba_minuto" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
