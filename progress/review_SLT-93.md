# review SLT-93 «API v1: nombre de lote repetido responde 500 en vez de 409»

Ruta **directa**, revisión acotada al diff `origin/dev...35a48a90` (PR #227). Contrato: feature 141 R24
(`specs/141-tabla-cargas-orden/requirements.md:123`, `design.md:233`).

## Checklist

- [x] **Trazabilidad (141 R24).** `tests/integration/db/carga-nombre-duplicado-real.test.ts`: repositorio
  (`CargaNombreDuplicadoError` con el nombre, 1 sola fila), borde v1 (409 `CONFLICT`), alcance por actor
  (otra key → 200). Los 4 casos corren (19/19 junto al unitario, 0 skipped) en la desechable PG18.
- [x] **Cuerpo del 409** = el de 141 `design.md:233`: `ConflictError("ya existe una carga con el nombre '<name>'")`;
  el test compara `code === "CONFLICT"` y el mensaje literal con el nombre (no contra su propia fuente).
- [x] **Rojo repetido.** `git checkout origin/dev -- lib/repositories/carga-lote.ts` → 2 rojos
  (`expected PrismaClientKnownRequestError … CargaNombreDuplicadoError`, `expected 500 to be 409`). Restaurado.
- [x] **Solo el índice de nombre por usuario.** Caso ad hoc (archivo temporal, borrado): P2002 adapter con
  `orden_guia_key`, nativo con `["usuario_id","num_remision"]` y adapter con `carga_pkey` → se propagan crudos;
  `carga_usuario_carga_name_key` → `CargaNombreDuplicadoError`. Con el `carga-lote.ts` de dev, este último cae.
  Además el `try` solo envuelve `tx.carga.create`, y `carga` solo tiene `carga_pkey` (id `randomUUID`) y
  `carga_usuario_carga_name_key` (schema y migraciones): un P2002 de guía/remisión de `orden` no llega aquí.
- [x] **Postgres real, sin vacío.** Transacción revertida + savepoints, siembra sus usuarios
  (`crearUsuarioDePrueba`), nombres `randomUUID`, controles positivos (`antes = 1`, primera = 200).
  23505 / `server_version_num >= 170000`: válido en PG17 y PG18 sin ramificar.
- [x] **CI lo recoge.** `vitest.config` incluye `tests/**/*.test.ts`; `gate.yml` levanta `postgres:17` con
  `DATABASE_URL` en el entorno → `HAY_BASE_DE_DATOS` verdadero, no se salta.
- [x] Tamaño: 2/40 archivos, 27/1000 producción, 223/3000 tests.
- [x] eslint de los 2 archivos limpio; `tsc --noEmit` sin errores.
- [x] Reuso: `textoConstraintP2002` existente, sin patrón nuevo. Sin esquema, migración ni dependencia.
- [x] Reglas del proyecto (perfil reviewer): sin tabla/query nueva, sin literales de país, sin Ordenex,
  comentarios explican el porqué. No toca `db/`, pantallas ni dinero: no aplica E2E.

## Hallazgos

1. **menor** — Ningún test del repo fija que *otro* P2002 no se convierta en 409. Mutación
   `return texto.length > 0` (cualquier P2002 = nombre repetido) sobrevive: 32/32 verdes en el test nuevo,
   `carga-lote.test.ts` y `orden-repository.carga-lote.test.ts`. El código hoy es correcto (caso ad hoc arriba)
   y el único otro único de `carga` es la PK con UUID del servidor, por eso no bloquea. Sugerido: un caso en
   `tests/unit/repositories/carga-lote.test.ts` con P2002 adapter de otra constraint → se propaga crudo.
2. **menor** — Ruta directa sobre el endpoint de API key (superficie de integradores). No la subo de ruta: el
   diff no cambia el contrato ni la autenticación, solo devuelve el comportamiento ya especificado en 141 R24, y
   la ruta la aprobó Carlos. Lo dejo anotado por si el leader lee la regla de otra forma.
3. **menor** — La vía sesión (`app/api/ordenes/carga-masiva/chunk/route.ts`) también se arregla con este cambio
   (mismo helper), pero solo hay test de borde para v1. El caso del repositorio la cubre indirectamente.

## Veredicto

**OK**
