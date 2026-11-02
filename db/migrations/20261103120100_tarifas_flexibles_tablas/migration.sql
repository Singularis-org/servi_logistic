-- SLT-52 (T1.2, design §2.2-§2.6, R4, R7, R8, R10, R11, R12, R15, R34, R43, R44, R45) — las tablas
-- del modelo nuevo de tarifas y la marca de modelo del snapshot del cierre.
--
-- SOLO ESQUEMA (R44): ninguna fila existente se mueve, cambia ni borra. `tarifas`,
-- `tarifa_zona_mensajero` y `distrito_zona_especial` no se tocan; `cierre_detail` gana una columna
-- con DEFAULT constante, que en Postgres 11+ es solo catalogo (no reescribe la tabla): todas sus
-- filas pasan a leerse `viejo`, que es lo que son (R42).
--
-- Piezas de SL-17 en las cinco tablas (molde `20261029120000_gestion_pago_mensajero_ajuste`):
-- `organizacion_id` NOT NULL con el DEFAULT de la empresa de la transaccion, su FK, su indice y la
-- politica `<t>_por_empresa`. Los triggers de misma empresa van en 20261103120200, GENERADOS.
--
-- FK COMPUESTAS (design §2.3, §2.4): son lo que hace que la BASE, y no solo el service, impida un
-- grupo de otra zona o un distrito fuera de la zona (R7, R11), y que un distrito que sale de su zona
-- salga solo de sus grupos (R12). Necesitan el destino UNIQUE `(id, zona_id)` de `grupo_distritos`.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

-- ─── grupo_distritos ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "grupo_distritos" (
  "id"              TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
  "zona_id"         TEXT NOT NULL,
  "nombre"          VARCHAR(60) NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "grupo_distritos_pkey" PRIMARY KEY ("id"),
  -- Patron de `zona_sinpe_nombre_check`: `btrim` solo quita 0x20 y dejaria pasar un nombre de
  -- tabuladores que el borde (`.trim()` de zod) si rechaza.
  CONSTRAINT "grupo_distritos_nombre_no_vacio" CHECK ("nombre" ~ '[^[:space:]]')
);

-- R10: nombre unico dentro de la zona (y por empresa, como todo unico de negocio).
CREATE UNIQUE INDEX "grupo_distritos_organizacion_id_zona_id_nombre_key"
  ON "grupo_distritos"("organizacion_id", "zona_id", "nombre");
-- Destino de las FK compuestas de abajo. Anclado (lleva el PK y `zona_id` NOT NULL): en
-- `UNICOS_SIN_EMPRESA`.
CREATE UNIQUE INDEX "grupo_distritos_id_zona_id_key" ON "grupo_distritos"("id", "zona_id");
CREATE INDEX "grupo_distritos_organizacion_id_idx" ON "grupo_distritos"("organizacion_id");
-- La FK CASCADE desde `zona`: sin indice, borrar una zona recorre la tabla.
CREATE INDEX "grupo_distritos_zona_id_idx" ON "grupo_distritos"("zona_id");

ALTER TABLE "grupo_distritos" ADD CONSTRAINT "grupo_distritos_organizacion_id_fkey"
  FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "grupo_distritos" ADD CONSTRAINT "grupo_distritos_zona_id_fkey"
  FOREIGN KEY ("zona_id") REFERENCES "zona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── grupo_distritos_distrito ────────────────────────────────────────────────────────────────────
CREATE TABLE "grupo_distritos_distrito" (
  "id"              TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
  "grupo_id"        TEXT NOT NULL,
  -- Redundante con el grupo A PROPOSITO: es la columna que comparten las dos FK compuestas, y es lo
  -- que obliga a que el distrito sea de la MISMA zona que el grupo.
  "zona_id"         TEXT NOT NULL,
  "distrito_id"     TEXT NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "grupo_distritos_distrito_pkey" PRIMARY KEY ("id")
);

-- R11: un distrito, a lo sumo un grupo por zona (misma forma que el unico de SLT-75). El nombre es
-- el que Prisma da al `@@unique` recortado a 63 caracteres: con el recorte de Postgres habria drift.
CREATE UNIQUE INDEX "grupo_distritos_distrito_organizacion_id_zona_id_distrito_i_key"
  ON "grupo_distritos_distrito"("organizacion_id", "zona_id", "distrito_id");
CREATE INDEX "grupo_distritos_distrito_grupo_id_idx" ON "grupo_distritos_distrito"("grupo_id");
CREATE INDEX "grupo_distritos_distrito_organizacion_id_idx" ON "grupo_distritos_distrito"("organizacion_id");
-- Las dos FK CASCADE que llegan por `(zona_id, …)`: borrar una zona o sacar un distrito de ella
-- busca por aqui.
CREATE INDEX "grupo_distritos_distrito_zona_id_distrito_id_idx" ON "grupo_distritos_distrito"("zona_id", "distrito_id");

ALTER TABLE "grupo_distritos_distrito" ADD CONSTRAINT "grupo_distritos_distrito_organizacion_id_fkey"
  FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- La FK simple a `zona` es la que lleva el trigger de misma empresa; las compuestas quedan cubiertas
-- a traves de ella (`lib/db/fk-de-negocio.ts`, regla de la columna compartida).
ALTER TABLE "grupo_distritos_distrito" ADD CONSTRAINT "grupo_distritos_distrito_zona_id_fkey"
  FOREIGN KEY ("zona_id") REFERENCES "zona"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- R11/R12: el grupo es de esta zona; borrar el grupo borra su lista de distritos.
ALTER TABLE "grupo_distritos_distrito" ADD CONSTRAINT "grupo_distritos_distrito_grupo_id_zona_id_fkey"
  FOREIGN KEY ("grupo_id", "zona_id") REFERENCES "grupo_distritos"("id", "zona_id") ON DELETE CASCADE ON UPDATE CASCADE;
-- R11/R12: el distrito pertenece a la zona; cuando sale de ella, sale del grupo.
ALTER TABLE "grupo_distritos_distrito" ADD CONSTRAINT "grupo_distritos_distrito_zona_id_distrito_id_fkey"
  FOREIGN KEY ("zona_id", "distrito_id") REFERENCES "zona_distrito"("zona_id", "distrito_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── tarifa_valor ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE "tarifa_valor" (
  "id"              TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
  "concepto"        "tarifa_concepto" NOT NULL,
  "modo"            "tarifa_modo" NOT NULL,
  -- Monto o porcentaje segun `modo`. Escala 2, como el resto del dinero.
  "valor"           DECIMAL(12,2) NOT NULL,
  -- Solo en los cobros a la tienda (P4): ver `tarifa_valor_iva_solo_tienda`.
  "iva_pct"         DECIMAL(5,2),
  "zona_id"         TEXT,
  "grupo_id"        TEXT,
  "tienda_id"       TEXT,
  "mensajero_id"    TEXT,
  "vehiculo_id"     TEXT,
  "actualizado_por" TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tarifa_valor_pkey" PRIMARY KEY ("id"),
  -- R4: la base rechaza lo que el service rechaza, para lo que entra por debajo de la app (seeds,
  -- scripts, SQL a mano). Prisma no expresa CHECK: viven solo aqui.
  CONSTRAINT "tarifa_valor_no_negativo" CHECK ("valor" >= 0),
  CONSTRAINT "tarifa_valor_porcentaje_tope" CHECK ("modo" <> 'porcentaje' OR "valor" <= 100),
  -- R4/R45 (P4): el cobro a la tienda lleva IVA de 0 a 100; un pago NO lleva IVA, tampoco 0. Se
  -- IMPIDE en vez de ignorarlo: un IVA de pago guardado seria un dato que alguien leeria y que la app
  -- nunca aplicaria.
  CONSTRAINT "tarifa_valor_iva_solo_tienda" CHECK (
    ("concepto"::text LIKE 'tienda\_%' AND "iva_pct" IS NOT NULL AND "iva_pct" BETWEEN 0 AND 100)
    OR ("concepto"::text NOT LIKE 'tienda\_%' AND "iva_pct" IS NULL)
  ),
  -- R7: con MATCH SIMPLE, la FK compuesta `(grupo_id, zona_id)` no se comprueba si `zona_id` es
  -- NULL; sin este CHECK cabria un grupo de cualquier zona.
  CONSTRAINT "tarifa_valor_grupo_con_zona" CHECK ("grupo_id" IS NULL OR "zona_id" IS NOT NULL),
  -- R5/R7: niveles de la tienda (zona, grupo, tienda en zona, tienda en grupo, tienda en todas sus
  -- zonas). Nunca mensajero ni vehiculo, y nunca ningun nivel.
  CONSTRAINT "tarifa_valor_niveles_tienda" CHECK (
    "concepto"::text NOT LIKE 'tienda\_%'
    OR ("mensajero_id" IS NULL AND "vehiculo_id" IS NULL AND ("zona_id" IS NOT NULL OR "tienda_id" IS NOT NULL))
  ),
  -- R6/R7: el valor propio del mensajero va solo (sin zona, grupo ni vehiculo); el resto cuelga de
  -- una zona. Nunca una tienda.
  CONSTRAINT "tarifa_valor_niveles_mensajero" CHECK (
    "concepto"::text NOT LIKE 'mensajero\_%'
    OR ("tienda_id" IS NULL AND (
      ("mensajero_id" IS NOT NULL AND "zona_id" IS NULL AND "grupo_id" IS NULL AND "vehiculo_id" IS NULL)
      OR ("mensajero_id" IS NULL AND "zona_id" IS NOT NULL)
    ))
  ),
  -- R6/R7: la satelite, como el mensajero sin el nivel propio.
  CONSTRAINT "tarifa_valor_niveles_satelite" CHECK (
    "concepto"::text NOT LIKE 'satelite\_%'
    OR ("tienda_id" IS NULL AND "mensajero_id" IS NULL AND "zona_id" IS NOT NULL)
  )
);

-- R8: un valor por empresa, concepto y nivel EXACTO. NULLS NOT DISTINCT (PG15+) porque el nivel se
-- define justo por que columnas van NULL: sin el, dos «zona para todos los vehiculos» del mismo
-- concepto convivirian. Prisma no lo expresa: el `@@unique` declara el nombre y esto lo crea, como
-- `tarifas_zona_id_tienda_id_key`. Empieza por `organizacion_id`: unico por empresa.
CREATE UNIQUE INDEX "tarifa_valor_nivel_key"
  ON "tarifa_valor"("organizacion_id", "concepto", "zona_id", "grupo_id", "tienda_id", "mensajero_id", "vehiculo_id")
  NULLS NOT DISTINCT;
-- Las tres ramas del WHERE del resolver (design §4): por zona, por tienda, por mensajero.
CREATE INDEX "tarifa_valor_organizacion_id_zona_id_idx" ON "tarifa_valor"("organizacion_id", "zona_id");
CREATE INDEX "tarifa_valor_organizacion_id_tienda_id_idx" ON "tarifa_valor"("organizacion_id", "tienda_id");
CREATE INDEX "tarifa_valor_organizacion_id_mensajero_id_idx" ON "tarifa_valor"("organizacion_id", "mensajero_id");
-- FK CASCADE desde el grupo y RESTRICT hacia el vehiculo: sin indice, cada borrado recorre la tabla.
CREATE INDEX "tarifa_valor_grupo_id_idx" ON "tarifa_valor"("grupo_id");
CREATE INDEX "tarifa_valor_vehiculo_id_idx" ON "tarifa_valor"("vehiculo_id");

ALTER TABLE "tarifa_valor" ADD CONSTRAINT "tarifa_valor_organizacion_id_fkey"
  FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tarifa_valor" ADD CONSTRAINT "tarifa_valor_zona_id_fkey"
  FOREIGN KEY ("zona_id") REFERENCES "zona"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- R7/R12: el grupo es de la zona del valor; borrar el grupo borra sus valores.
ALTER TABLE "tarifa_valor" ADD CONSTRAINT "tarifa_valor_grupo_id_zona_id_fkey"
  FOREIGN KEY ("grupo_id", "zona_id") REFERENCES "grupo_distritos"("id", "zona_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tarifa_valor" ADD CONSTRAINT "tarifa_valor_tienda_id_fkey"
  FOREIGN KEY ("tienda_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tarifa_valor" ADD CONSTRAINT "tarifa_valor_mensajero_id_fkey"
  FOREIGN KEY ("mensajero_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- RESTRICT: `vehiculos` es catalogo; un tipo con valores pactados no desaparece en silencio.
ALTER TABLE "tarifa_valor" ADD CONSTRAINT "tarifa_valor_vehiculo_id_fkey"
  FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tarifa_valor" ADD CONSTRAINT "tarifa_valor_actualizado_por_fkey"
  FOREIGN KEY ("actualizado_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── cierre_detail.tarifa_modelo ─────────────────────────────────────────────────────────────────
-- R42: DEFAULT constante = solo catalogo; las filas existentes se leen `viejo` sin reescribirse.
ALTER TABLE "cierre_detail" ADD COLUMN "tarifa_modelo" "tarifa_modelo" NOT NULL DEFAULT 'viejo';

-- ─── cierre_detail_concepto ──────────────────────────────────────────────────────────────────────
-- R40: el cobro a la tienda CONGELADO por orden, un concepto por fila. Un concepto sin tarifa no
-- tiene fila (R23): la ausencia es el dato, sin un NULL ambiguo.
CREATE TABLE "cierre_detail_concepto" (
  "id"               TEXT NOT NULL,
  "organizacion_id"  TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
  "cierre_detail_id" TEXT NOT NULL,
  "concepto"         "tarifa_concepto" NOT NULL,
  "modo"             "tarifa_modo" NOT NULL,
  "valor"            DECIMAL(12,2) NOT NULL,
  "iva_pct"          DECIMAL(5,2) NOT NULL,
  "nivel"            "tarifa_nivel" NOT NULL,
  "tarifa_valor_id"  TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cierre_detail_concepto_pkey" PRIMARY KEY ("id"),
  -- Solo cobros a la tienda: el pago congelado vive en `gestion_pago_congelado`, sin IVA.
  CONSTRAINT "cierre_detail_concepto_solo_tienda" CHECK ("concepto"::text LIKE 'tienda\_%')
);

-- Anclado a `cierre_detail` (FK NOT NULL): en `UNICOS_SIN_EMPRESA`.
CREATE UNIQUE INDEX "cierre_detail_concepto_cierre_detail_id_concepto_key"
  ON "cierre_detail_concepto"("cierre_detail_id", "concepto");
CREATE INDEX "cierre_detail_concepto_organizacion_id_idx" ON "cierre_detail_concepto"("organizacion_id");
-- La FK SET NULL: borrar un valor busca sus copias por aqui.
CREATE INDEX "cierre_detail_concepto_tarifa_valor_id_idx" ON "cierre_detail_concepto"("tarifa_valor_id");

ALTER TABLE "cierre_detail_concepto" ADD CONSTRAINT "cierre_detail_concepto_organizacion_id_fkey"
  FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- RESTRICT, como las FK de `cierre_detail`: lo congelado sobrevive a cualquier intento de borrar.
ALTER TABLE "cierre_detail_concepto" ADD CONSTRAINT "cierre_detail_concepto_cierre_detail_id_fkey"
  FOREIGN KEY ("cierre_detail_id") REFERENCES "cierre_detail"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- SET NULL (precedente 337): la traza al valor de origen es deseable, nunca un bloqueo para borrarlo
-- (R9). Los importes ya viajan COPIADOS. La accion referencial corre como dueño de la tabla, asi que
-- el REVOKE de abajo no la impide.
ALTER TABLE "cierre_detail_concepto" ADD CONSTRAINT "cierre_detail_concepto_tarifa_valor_id_fkey"
  FOREIGN KEY ("tarifa_valor_id") REFERENCES "tarifa_valor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── gestion_pago_congelado ──────────────────────────────────────────────────────────────────────
-- R40/R34: el pago de UNA gestion al mensajero o a la satelite, congelado. SIN columna de IVA (P4):
-- la tabla no puede representar un IVA de pago.
CREATE TABLE "gestion_pago_congelado" (
  "id"               TEXT NOT NULL,
  "organizacion_id"  TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
  "gestion_orden_id" TEXT NOT NULL,
  "actor"            "tarifa_actor" NOT NULL,
  "concepto"         "tarifa_concepto" NOT NULL,
  "modo"             "tarifa_modo" NOT NULL,
  "valor"            DECIMAL(12,2) NOT NULL,
  "nivel"            "tarifa_nivel" NOT NULL,
  "tarifa_valor_id"  TEXT,
  -- R28: el flete sin IVA de ESA gestion, solo cuando el pago es un porcentaje.
  "base"             DECIMAL(12,2),
  -- Exactamente lo que se escribe en `pago_mensajero` / `ingreso_bodega_rechazo`.
  "importe"          DECIMAL(12,2) NOT NULL,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "gestion_pago_congelado_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gestion_pago_congelado_actor_no_tienda" CHECK ("actor" <> 'tienda'),
  CONSTRAINT "gestion_pago_congelado_concepto_no_tienda" CHECK ("concepto"::text NOT LIKE 'tienda\_%'),
  -- El concepto es del actor de la fila: un `satelite_*` congelado como pago al mensajero sumaria en
  -- el devengo equivocado.
  CONSTRAINT "gestion_pago_congelado_concepto_del_actor" CHECK ("concepto"::text LIKE "actor"::text || '\_%'),
  -- La base solo existe para el porcentaje: en monto no hay nada sobre lo que calcular.
  CONSTRAINT "gestion_pago_congelado_base_solo_porcentaje" CHECK (("modo" = 'porcentaje') = ("base" IS NOT NULL))
);

-- Anclado a `gestion_orden` (FK NOT NULL): en `UNICOS_SIN_EMPRESA`. Un pago por actor y gestion.
CREATE UNIQUE INDEX "gestion_pago_congelado_gestion_orden_id_actor_key"
  ON "gestion_pago_congelado"("gestion_orden_id", "actor");
CREATE INDEX "gestion_pago_congelado_organizacion_id_idx" ON "gestion_pago_congelado"("organizacion_id");
CREATE INDEX "gestion_pago_congelado_tarifa_valor_id_idx" ON "gestion_pago_congelado"("tarifa_valor_id");

ALTER TABLE "gestion_pago_congelado" ADD CONSTRAINT "gestion_pago_congelado_organizacion_id_fkey"
  FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gestion_pago_congelado" ADD CONSTRAINT "gestion_pago_congelado_gestion_orden_id_fkey"
  FOREIGN KEY ("gestion_orden_id") REFERENCES "gestion_orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gestion_pago_congelado" ADD CONSTRAINT "gestion_pago_congelado_tarifa_valor_id_fkey"
  FOREIGN KEY ("tarifa_valor_id") REFERENCES "tarifa_valor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── RLS (R15) ───────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "grupo_distritos" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grupo_distritos_por_empresa" ON "grupo_distritos" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

ALTER TABLE "grupo_distritos_distrito" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grupo_distritos_distrito_por_empresa" ON "grupo_distritos_distrito" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

ALTER TABLE "tarifa_valor" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tarifa_valor_por_empresa" ON "tarifa_valor" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

ALTER TABLE "cierre_detail_concepto" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cierre_detail_concepto_por_empresa" ON "cierre_detail_concepto" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

ALTER TABLE "gestion_pago_congelado" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gestion_pago_congelado_por_empresa" ON "gestion_pago_congelado" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- ─── Privilegios ─────────────────────────────────────────────────────────────────────────────────
-- El CRUD de `servi_app` sobre las cinco lo da el ALTER DEFAULT PRIVILEGES de 20261022130000; se
-- repite explicito para no depender de quien ejecute la migracion.
GRANT SELECT, INSERT, UPDATE, DELETE ON "grupo_distritos", "grupo_distritos_distrito", "tarifa_valor",
  "gestion_pago_congelado" TO servi_app;
GRANT SELECT, INSERT ON "cierre_detail_concepto" TO servi_app;
-- R43 (precedente SLT-56): lo congelado del cobro es inmutable para la app; se inserta al crear el
-- cierre y nunca se reescribe ni se borra. `gestion_pago_congelado` NO se revoca: la correccion de un
-- resultado (398) y la re-solicitud de un rechazado (477) re-congelan el pago de UNA gestion en su
-- transaccion, igual que hoy reescriben `pago_mensajero` (design §2.5).
REVOKE UPDATE, DELETE ON "cierre_detail_concepto" FROM servi_app;
