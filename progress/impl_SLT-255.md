# SLT-255 «Planes: prórroga del pago antes del congelamiento» — bitácora de implementación

## Tanda 1 — Enums y catálogo del historial (backend_dev, 2026-11-23)

T1.1, T1.2 y T1.3 hechas. Base: `servi_logistic_slt255`, con `20261127120000_prorroga_enums` aplicada por
`pnpm exec prisma migrate deploy` y el cliente regenerado (`prisma generate`).

### Archivos

Creados:

- `db/migrations/20261127120000_prorroga_enums/migration.sql`: los dos `ADD VALUE IF NOT EXISTS`, sola por el 55P04.
- `db/migrations/20261127120000_prorroga_enums/down.sql`: la función de SLT-136 con el sufijo `_255`, en
  `BEGIN … COMMIT`. Generada copiando la de SLT-121 con `sed`; comparada con `diff` contra la de SLT-136: igual.
- `tests/integration/db/prorroga-migration.test.ts`.

Modificados:

- `db/schema.prisma`: los dos valores en `HistorialAccionTipo` y el comentario de `descongeladaHasta` (design §1.1).
- `lib/types/historial-accion.ts`: catálogo, `CATEGORIA_POR_ACCION` (`mora`) y `ACCION_LABELS`.
- `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`: el total pasa de 95 a 97, la categoría `mora`
  incluye los dos, y hay un `describe` nuevo de SLT-255.
- `tests/integration/db/mora-migration.test.ts`: un caso en disco. La de la prórroga va detrás de la principal de
  SLT-121, y el `down` de enums de la mora no nombra sus valores.
- Los 8 inventarios de `historial_accion_tipo`, siguiendo el patrón de SLT-121:
  - `caja-459-migration`: los dos se afirman al final y se quitan antes de los cortes (`hastaSlt121`).
  - Los otros 7 añaden los dos a la lista de posteriores: `correccion-resultado-gestion`,
    `historial-accion-cobro-tienda`, `historial-accion-conciliacion-bodega`,
    `historial-accion-orden-zona-reconciliada`, `historial-accion-pago-mensajero-ajustado`,
    `historial-accion-zona-pago-mensajero` y `historial-accion-zona-sinpe`.
- **Fuera de la lista de `tasks.md`:** `tests/integration/db/orden-traspaso-migration.test.ts`. Su lista exacta de
  migraciones posteriores se pone roja con cualquier carpeta nueva; SLT-121 también la amplió. Se añade
  `20261127120000_prorroga_enums`. Con esto el PR queda en 42 archivos, no en los 41 aceptados.

### Qué cubre cada test

| Test | Cubre |
|---|---|
| `prorroga-migration.test.ts` | design §1.2 (base de R14 y R15). En disco: va justo después de SLT-121, sola y con los dos `ADD VALUE`. El `down` va en `BEGIN … COMMIT`, con la función de SLT-136 byte a byte salvo el sufijo, y quita solo los dos. En base propia (`slt255_iv_*`): subir añade solo los dos, al final; el `down` aborta (P0001) si una fila los usa, sin tocar nada; bajar deja la foto igual; bajar otra vez no hace nada; subir otra vez da el mismo esquema. |
| `catalogo-y-choke-point.test.ts` | R14: los dos van a la categoría `mora`, con sus etiquetas, al final del catálogo. Hay 97 tipos. |
| `mora-migration.test.ts` y los 8 inventarios | design §1.2: los dos valores se afirman al final y se quitan antes de los cortes. |

### Verificación (salida real)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: `tsc --noEmit`, salida 0, sin errores.
- `pnpm exec eslint` sobre los 13 archivos TS tocados: salida 0, sin avisos.
- `pnpm exec vitest run` sobre los 12 archivos de test tocados, con `DATABASE_URL` de la base de la feature:
  - prorroga, mora, los 8 inventarios, orden-traspaso y catalogo;
  - `Test Files 12 passed (12)`, `Tests 194 passed (194)`: 0 fallidos y 0 saltados.
- Informativo, fuera del encargo: `historial-accion-escrituras-cubiertas.guardia.test.ts` da **2 rojos esperados**.
  - Los dos casos son «TODO valor del enum tiene productor declarado» y «los 55 tipos del Anexo A … siguen siendo 55».
  - Los dos tipos nuevos todavía no tienen productor ni entrada en el censo. Eso es T2.3, que lo enmienda por spec.
  - `historial-accion-sin-datos-cliente` está en verde.

### Veredicto

Tanda 1 en verde. La guardia del censo sigue roja hasta T2.3, y `orden-traspaso-migration` es un archivo fuera de
la lista de `tasks.md`.
