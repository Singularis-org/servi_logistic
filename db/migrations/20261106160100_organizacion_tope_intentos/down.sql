-- DOWN de SLT-77 T1.2 — devuelve `organizacion` a solo lectura para la app y quita el tope.
--
-- PIERDE LOS VALORES ELEGIDOS (design §8): solo se baja si se abandona la feature. Volver a un despliegue
-- anterior sin este down conserva los valores.
--
-- ORDEN: va ANTES del down de 20261106160000 (los downs van en orden inverso).
--
-- El REVOKE nombra las dos columnas aunque el DROP se lleve el privilegio de la suya: el de `updated_at`
-- sobreviviria y la app podria seguir escribiendo en una tabla que el codigo anterior da por solo lectura.

BEGIN;

DROP POLICY "organizacion_propia_editar_tope" ON "organizacion";
REVOKE UPDATE ("tope_intentos_entrega", "updated_at") ON "organizacion" FROM servi_app;
ALTER TABLE "organizacion" DROP COLUMN "tope_intentos_entrega";

COMMIT;
