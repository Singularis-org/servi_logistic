# impl SLT-93 «API v1: nombre de lote repetido responde 500 en vez de 409»

Ruta directa. Base desechable `servi_slt93_desechable` (PG18 local), migrada y con seed de catálogos.

## Archivos
- `lib/repositories/carga-lote.ts` — `esNombreDuplicado` deja de leer solo `meta.target` y usa el helper
  existente `textoConstraintP2002` (`lib/repositories/_shared/prisma-unique.ts`): reconoce el índice
  `carga_usuario_carga_name_key` (adapter) o `usuario_carga,name` (motor nativo).
- `tests/integration/db/carga-nombre-duplicado-real.test.ts` — nuevo, contra Postgres real, en
  transacción revertida y savepoints.
- `progress/features/SLT-93.md` — nuevo, desde la plantilla.

No existen en dev `lib/api/api-carga.ts` (v2) ni `tests/fixtures/contrato-v1`: no hay paso de contrato
congelado que añadir. Sin esquema, sin migración, sin dependencia.

## Mapa R → test (feature 141 R24, en `carga-nombre-duplicado-real.test.ts`)
- Forma del error medida: «forma medida: el adapter da P2002 SIN columnas en meta.target y SQLSTATE 23505 en la cadena»
  (también comprueba `server_version_num >= 170000`: 23505 es el mismo en PG17 y PG18, sin ramificar).
- R24 repositorio: «mismo actor y mismo nombre -> CargaNombreDuplicadoError, no el P2002 crudo».
- R24 borde v1: «POST con nombre repetido por la misma key -> 409 CONFLICT con el nombre, no 500»
  (cuerpo `{ code: "CONFLICT", message: "ya existe una carga con el nombre '<name>'" }`).
- R24 alcance por actor: «OTRA key con el mismo nombre -> 200». El éxito de v1 es 200, no 201 (lo fija el route).
- Forma nativa (`meta.target = ["usuario_carga","name"]`) sigue cubierta por
  `tests/unit/repositories/carga-lote.test.ts` («traduce el P2002 de Prisma sobre (usuario_carga, name)…»).

## Rojo (antes del arreglo)
`con-desechable … -- pnpm exec vitest run tests/integration/db/carga-nombre-duplicado-real.test.ts`
```
     × R24 (repositorio): mismo actor y mismo nombre -> CargaNombreDuplicadoError, no el P2002 crudo 44ms
     × R24 (borde v1): POST con nombre repetido por la misma key -> 409 CONFLICT con el nombre, no 500 36ms
      Tests  2 failed | 2 passed (4)
AssertionError: expected PrismaClientKnownRequestError{ …(7) } to be an instance of CargaNombreDuplicadoError
AssertionError: expected 500 to be 409 // Object.is equality
```

## Verde (con el arreglo)
`… vitest run` del test nuevo + `tests/unit/repositories/carga-lote.test.ts` +
`tests/unit/repositories/orden-repository.carga-lote.test.ts` + `tests/integration/api/ordenes-api-key-carga.route.test.ts`
```
 Test Files  4 passed (4)
      Tests  65 passed (65)
```

## Mutaciones
1. Arreglo revertido (`git checkout -- lib/repositories/carga-lote.ts`): 2 rojos (salida de «Rojo» arriba). Reaplicado.
2. Nombre del índice cambiado a `zzz_indice_mutado` en el arreglo: 3 rojos (repositorio, 409 y otra key → 500). Restaurado con `git checkout` + reaplicar.
3. Test «otra key» con la key B sustituida por la A: `expected 409 to be 200`, 1 rojo. Restaurado → `Tests 4 passed (4)`.
4. (Review 38a22385) `esNombreDuplicado` devolviendo `true` para CUALQUIER P2002: el caso nuevo de
   `tests/unit/repositories/carga-lote.test.ts` «SLT-93: un P2002 de OTRA restriccion (carga_pkey) sale tal cual…»
   (formas adapter `carga_pkey` y nativa `["id"]`) se pone ROJO:
   `Tests 1 failed | 15 passed (16)` — `expected CargaNombreDuplicadoError … to be PrismaClientKnownRequestError`.
   Restaurado con `git checkout -- lib/repositories/carga-lote.ts` → unit + integración `Tests 20 passed (20)`.

## Gate
Tanda 2 (review 38a22385): gate rápido `✓ typecheck paso`, `✓ lint paso`, `✓ test:rapido paso` (4 rojos heredados del baseline), `== init OK ==`, `INIT_EXIT=0`. Tanda 1 abajo.

`bash ./init.sh` (rápido) vía `con-desechable … servi_slt93_desechable`, log completo con `INIT_EXIT` dentro:
```
✓ typecheck paso
✓ lint paso            (solo warnings previos, ninguno en archivos de SLT-93)
[test:rapido] 4 rojo(s) heredado(s) del baseline no cuentan en esta seleccion; el CI los compara.
✓ test:rapido paso
✓ todas las migraciones tienen down.sql
== init OK ==
INIT_EXIT=0
```
Nota: el test nuevo estaba sin trackear y la selección de `vitest related` no lo incluyó; se corrió aparte
(salida «Verde» arriba). Baseline: ninguna entrada cita SLT-93; nada que podar.

## Veredicto
Nombre de lote repetido por la misma key → 409 en v1, detectado sin depender de `meta.target`; otra key → 200.
