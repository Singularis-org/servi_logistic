-- SLT-89 (design §2.1, §2.2, §2.3, §2.5; R2, R28, R29, R32, R34) — una zona puede asignarse a un nodo
-- que no es distrito, y un grupo de distritos puede tener miembros que no son «distrito asignado».
--
-- (En el spec, `20261109120000_slt89_zona_nodo`: el timestamp choca con `20261109120000_cobro_plataforma_traza`
-- de dev y se movió aquí; ver progress/impl_SLT-89.md.)
--
-- TABLAS HERMANAS, no columnas nuevas: `zona_distrito` y `grupo_distritos_distrito` no se tocan. Un
-- distrito se sigue asignando en `zona_distrito` (único de SLT-75, FK compuesta de los grupos de
-- SLT-52, historial de SLT-76); lo demás va aquí. Con las dos tablas vacías —Costa Rica el día del
-- deploy— cada lectura da lo de hoy (R38).
--
-- SOLO ADITIVA (R32): dos tablas nuevas con sus índices, FK, RLS y triggers; un trigger nuevo en
-- `grupo_distritos_distrito` (no cambia columnas ni filas); y `CREATE OR REPLACE` del cuerpo de
-- `orden_nodo_geografico`, que no toma bloqueo sobre `orden` (no es `ALTER TABLE`). Ninguna fila
-- existente se escribe.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000). Los nombres de los
-- índices y las FK son los que da `prisma migrate diff` para `db/schema.prisma` (sin drift).

BEGIN;

-- ─── zona_nodo (§2.1) ────────────────────────────────────────────────────────────────────────────
CREATE TABLE "zona_nodo" (
  "id"                 TEXT NOT NULL,
  "organizacion_id"    TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
  "zona_id"            TEXT NOT NULL,
  "nodo_geografico_id" TEXT NOT NULL,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "zona_nodo_pkey" PRIMARY KEY ("id")
);

-- R2: un nodo, a lo sumo una zona por empresa (el único de SLT-75 llevado al nodo). Es la red ante
-- dos guardados concurrentes que toman el mismo nodo.
CREATE UNIQUE INDEX "zona_nodo_organizacion_id_nodo_geografico_id_key"
  ON "zona_nodo"("organizacion_id", "nodo_geografico_id");
-- La FK CASCADE desde `zona`: sin índice, borrar una zona recorre la tabla.
CREATE INDEX "zona_nodo_zona_id_idx" ON "zona_nodo"("zona_id");
CREATE INDEX "zona_nodo_organizacion_id_idx" ON "zona_nodo"("organizacion_id");

ALTER TABLE "zona_nodo" ADD CONSTRAINT "zona_nodo_organizacion_id_fkey"
  FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "zona_nodo" ADD CONSTRAINT "zona_nodo_zona_id_fkey"
  FOREIGN KEY ("zona_id") REFERENCES "zona"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Como la de `zona_distrito` (SLT-43): si el nodo cae, cae su asignación.
ALTER TABLE "zona_nodo" ADD CONSTRAINT "zona_nodo_nodo_geografico_id_fkey"
  FOREIGN KEY ("nodo_geografico_id") REFERENCES "nodo_geografico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── grupo_distritos_nodo (§2.2) ─────────────────────────────────────────────────────────────────
CREATE TABLE "grupo_distritos_nodo" (
  "id"                 TEXT NOT NULL,
  "organizacion_id"    TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
  "grupo_id"           TEXT NOT NULL,
  -- Redundante con el grupo A PROPÓSITO, como en `grupo_distritos_distrito`: la FK compuesta
  -- `(grupo_id, zona_id)` es la que impide en la BASE un grupo de otra zona.
  "zona_id"            TEXT NOT NULL,
  "nodo_geografico_id" TEXT NOT NULL,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "grupo_distritos_nodo_pkey" PRIMARY KEY ("id")
);

-- Un nodo, a lo sumo un grupo por zona dentro de esta tabla; entre las dos tablas de miembros lo
-- cierran los triggers de abajo. Nombre recortado a 63 como lo recorta Prisma (si no, drift).
CREATE UNIQUE INDEX "grupo_distritos_nodo_organizacion_id_zona_id_nodo_geografic_key"
  ON "grupo_distritos_nodo"("organizacion_id", "zona_id", "nodo_geografico_id");
CREATE INDEX "grupo_distritos_nodo_grupo_id_idx" ON "grupo_distritos_nodo"("grupo_id");
CREATE INDEX "grupo_distritos_nodo_organizacion_id_idx" ON "grupo_distritos_nodo"("organizacion_id");
-- Lo que busca el trigger `grupo_distritos_distrito_sin_duplicado` en cada alta de la tabla vieja.
CREATE INDEX "grupo_distritos_nodo_zona_id_nodo_geografico_id_idx" ON "grupo_distritos_nodo"("zona_id", "nodo_geografico_id");

ALTER TABLE "grupo_distritos_nodo" ADD CONSTRAINT "grupo_distritos_nodo_organizacion_id_fkey"
  FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- La FK simple a `zona` lleva el trigger de misma empresa; la compuesta queda cubierta a través de
-- ella (`lib/db/fk-de-negocio.ts`, regla de la columna compartida), como en SLT-52.
ALTER TABLE "grupo_distritos_nodo" ADD CONSTRAINT "grupo_distritos_nodo_zona_id_fkey"
  FOREIGN KEY ("zona_id") REFERENCES "zona"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grupo_distritos_nodo" ADD CONSTRAINT "grupo_distritos_nodo_grupo_id_zona_id_fkey"
  FOREIGN KEY ("grupo_id", "zona_id") REFERENCES "grupo_distritos"("id", "zona_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grupo_distritos_nodo" ADD CONSTRAINT "grupo_distritos_nodo_nodo_geografico_id_fkey"
  FOREIGN KEY ("nodo_geografico_id") REFERENCES "nodo_geografico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SIN FK hacia la asignación: un nodo cubierto por herencia no tiene fila a la que apuntar. Que el
-- miembro esté cubierto por la zona del grupo lo mantiene la aplicación en una transacción (§2.2).

-- ─── Validación de los nodos (§2.1, §2.2; R34) ──────────────────────────────────────────────────
-- SECURITY DEFINER con `search_path` fijo, como `geografia_del_pais_de_la_empresa` (SL-20): como
-- `servi_app`, la RLS por país le escondería justo los nodos de otro país y los daría por
-- inexistentes. Un nodo o una empresa inexistentes no se miran aquí: los rechaza su FK.
--
-- En `zona_nodo`, la profundidad 3 (distrito) se rechaza con 23514: un distrito se asigna en
-- `zona_distrito`, nunca aquí. Así ningún distrito queda en las dos tablas y el único de SLT-75 sigue
-- siendo la única red para distritos.
CREATE FUNCTION zona_nodo_valido() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pais_empresa text;
  v_pais_nodo text;
  v_profundidad int;
BEGIN
  SELECT n.pais_id, n.profundidad INTO v_pais_nodo, v_profundidad
    FROM nodo_geografico n WHERE n.id = NEW.nodo_geografico_id;
  IF v_pais_nodo IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT o.pais_id INTO v_pais_empresa FROM organizacion o WHERE o.id = NEW.organizacion_id;
  IF v_pais_empresa IS NOT NULL AND v_pais_nodo <> v_pais_empresa THEN
    RAISE EXCEPTION 'geografía de otro país: %.nodo_geografico_id no es del país % de la empresa', TG_TABLE_NAME, v_pais_empresa
      USING ERRCODE = 'SL021';
  END IF;
  IF v_profundidad = 3 THEN
    RAISE EXCEPTION 'zona_nodo: el nodo % es un distrito; los distritos se asignan en zona_distrito', NEW.nodo_geografico_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- Un distrito con fila propia en `zona_distrito` de esa zona es miembro de la tabla vieja (con su FK
-- compuesta): aquí se rechaza con 23514. `zona_distrito.distrito_id` es el id del nodo (SLT-43 R13).
CREATE FUNCTION grupo_distritos_nodo_valido() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pais_empresa text;
  v_pais_nodo text;
BEGIN
  SELECT n.pais_id INTO v_pais_nodo FROM nodo_geografico n WHERE n.id = NEW.nodo_geografico_id;
  IF v_pais_nodo IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT o.pais_id INTO v_pais_empresa FROM organizacion o WHERE o.id = NEW.organizacion_id;
  IF v_pais_empresa IS NOT NULL AND v_pais_nodo <> v_pais_empresa THEN
    RAISE EXCEPTION 'geografía de otro país: %.nodo_geografico_id no es del país % de la empresa', TG_TABLE_NAME, v_pais_empresa
      USING ERRCODE = 'SL021';
  END IF;
  IF EXISTS (SELECT 1 FROM zona_distrito zd WHERE zd.zona_id = NEW.zona_id AND zd.distrito_id = NEW.nodo_geografico_id) THEN
    RAISE EXCEPTION 'grupo_distritos_nodo: el distrito % está asignado a la zona %; es miembro de grupo_distritos_distrito',
      NEW.nodo_geografico_id, NEW.zona_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- La otra mitad de «un nodo, a lo sumo un grupo por zona» entre las dos tablas: un distrito que ya
-- es miembro por `grupo_distritos_nodo` no entra además en `grupo_distritos_distrito` (23505, como
-- el único que choca). También en UPDATE de las columnas que lo deciden, para que no se esquive
-- cambiando una fila existente (la app no lo hace; el SQL a mano sí podría).
CREATE FUNCTION grupo_distritos_distrito_sin_duplicado() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM grupo_distritos_nodo g WHERE g.zona_id = NEW.zona_id AND g.nodo_geografico_id = NEW.distrito_id) THEN
    RAISE EXCEPTION 'grupo_distritos_distrito: el distrito % ya es miembro de un grupo de la zona % en grupo_distritos_nodo',
      NEW.distrito_id, NEW.zona_id
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "zona_nodo_valido"
  BEFORE INSERT OR UPDATE OF "nodo_geografico_id" ON "zona_nodo"
  FOR EACH ROW EXECUTE FUNCTION zona_nodo_valido();
CREATE TRIGGER "grupo_distritos_nodo_valido"
  BEFORE INSERT OR UPDATE OF "nodo_geografico_id", "zona_id" ON "grupo_distritos_nodo"
  FOR EACH ROW EXECUTE FUNCTION grupo_distritos_nodo_valido();
CREATE TRIGGER "grupo_distritos_distrito_sin_duplicado"
  BEFORE INSERT OR UPDATE OF "zona_id", "distrito_id" ON "grupo_distritos_distrito"
  FOR EACH ROW EXECUTE FUNCTION grupo_distritos_distrito_sin_duplicado();

-- ─── Misma empresa ───────────────────────────────────────────────────────────────────────────────
-- GENERADO con `tsx scripts/generar-misma-empresa.ts --faltantes`: no editar a mano.
--   · 2 FK de negocio a negocio: trigger `verificar_misma_empresa` (SQLSTATE SL017).
--   · 2 tablas de negocio: trigger `<tabla>_sin_cambio_de_empresa` (R38).

-- GrupoDistritosNodo.zona
CREATE TRIGGER "sme_grupo_distritos_nodo_zona_id_ac48564a" BEFORE INSERT OR UPDATE OF "zona_id", "organizacion_id"
  ON "grupo_distritos_nodo" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('zona', 'zona_id', 'id');
-- ZonaNodo.zona
CREATE TRIGGER "sme_zona_nodo_zona_id_cc871027" BEFORE INSERT OR UPDATE OF "zona_id", "organizacion_id"
  ON "zona_nodo" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('zona', 'zona_id', 'id');

CREATE TRIGGER "zona_nodo_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "zona_nodo" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "grupo_distritos_nodo_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "grupo_distritos_nodo" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();

-- ─── RLS y privilegios (R34) ─────────────────────────────────────────────────────────────────────
ALTER TABLE "zona_nodo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zona_nodo_por_empresa" ON "zona_nodo" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

ALTER TABLE "grupo_distritos_nodo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grupo_distritos_nodo_por_empresa" ON "grupo_distritos_nodo" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- El CRUD de `servi_app` lo da el ALTER DEFAULT PRIVILEGES de 20261022130000; se repite explícito
-- para no depender de quién ejecute la migración (como 20261103120100).
GRANT SELECT, INSERT, UPDATE, DELETE ON "zona_nodo", "grupo_distritos_nodo" TO servi_app;

-- ─── El nodo de la orden (§2.3; R28, R29) ────────────────────────────────────────────────────────
-- Solo cambia el CUERPO: el trigger `orden_nodo_geografico` y su lista de columnas son los de SLT-43.
-- Hasta aquí el nodo era siempre el lugar (`COALESCE(distrito_id, canton_id)`); ahora se conserva un
-- nodo que cuelga del lugar (un barrio dentro del distrito), para SLT-48. Nada en SLT-89 escribe aún
-- un nodo más profundo: la regla de guardado de SLT-45 sigue.
--
--   · Nodo ausente o igual al lugar: el lugar, sin consultar nada (lo de hoy, R29).
--   · En un UPDATE que mueve el lugar sin tocar el nodo, el nodo que trae NEW es el VIEJO, no uno que
--     alguien escribió: se pone el lugar, como SLT-43. Sin esto, pasar `distrito_id` a NULL (lo que
--     hace la FK al borrar un distrito) dejaría el distrito viejo como nodo —cuelga del cantón— y su
--     FK RESTRICT impediría borrarlo.
--   · Si no, se sube por `padre_id` desde el nodo hasta dar con el lugar: como mucho 10 saltos
--     (más que la profundidad de cualquier árbol cargado). Si no aparece, el nodo está fuera de la
--     rama y se pone el lugar.
-- Sin SECURITY DEFINER, como el cuerpo de SLT-43: un nodo que la RLS por país esconde a `servi_app`
-- no se encuentra al subir, y la orden se queda con su lugar. Poner el lugar se escribe con la MISMA
-- sentencia que SLT-43: es la que vigila `orden-nodo-escritura.test.ts` (SLT-45 R28).
CREATE OR REPLACE FUNCTION orden_nodo_geografico() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_lugar text := COALESCE(NEW.distrito_id, NEW.canton_id);
  v_actual text := NEW.nodo_geografico_id;
BEGIN
  IF v_actual IS NULL OR v_actual = v_lugar
     OR (TG_OP = 'UPDATE'
         AND NEW.nodo_geografico_id IS NOT DISTINCT FROM OLD.nodo_geografico_id
         AND v_lugar IS DISTINCT FROM COALESCE(OLD.distrito_id, OLD.canton_id)) THEN
    NEW.nodo_geografico_id := COALESCE(NEW.distrito_id, NEW.canton_id);
    RETURN NEW;
  END IF;
  FOR i IN 1 .. 10 LOOP
    SELECT n.padre_id INTO v_actual FROM nodo_geografico n WHERE n.id = v_actual;
    EXIT WHEN v_actual IS NULL;
    IF v_actual = v_lugar THEN
      RETURN NEW;
    END IF;
  END LOOP;
  NEW.nodo_geografico_id := COALESCE(NEW.distrito_id, NEW.canton_id);
  RETURN NEW;
END $$;

COMMIT;
