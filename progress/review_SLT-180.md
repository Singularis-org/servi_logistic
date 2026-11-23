# SLT-180 «Siembra propia en tests de API keys, historial y borrado de órdenes» — review

Revisado: rama `feature/SLT-180-siembra-tests-apikeys-historial`, HEAD `94220b0a`, contra `origin/dev`.
Ruta ligera (spec único `requirements.md`). Fecha: 2026-11-17.

## Checklist

- [x] **Ruta.** El diff solo toca `tests/` y `progress/`/`specs/`: `git diff --name-only origin/dev...HEAD
  -- lib app components hooks db scripts .github package.json` vacío. Toca tests de API keys, pero no
  cambia ningún comportamiento de autenticación: la ligera es válida (mismo criterio que SLT-178/179).
- [x] **Spec ligera.** `requirements.md` con alcance, `## Lo que ya existe` (no vacía; el diff no re-crea
  nada: reutiliza `crearFksDeOrden`/`crearUsuarioDePrueba`, `limpiarEmpresas`, `crearOrganizacion`),
  EARS R1040–R1052, `## Tasks` T1–T8 todas `[x]`, `## Archivos esperados`. Los 16 archivos del diff de
  tests están en esa lista; `_fixtures/orden-minima.ts` no se tocó.
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 16/40 archivos, 0/1000 producción, 759/3000 tests (R1052).
- [x] **Trazabilidad.** Mapa R → evidencia en `progress/impl_SLT-180.md > Mapa R → evidencia`. Cada R de
  esta ficha (siembra) se verifica con los propios 15 archivos ejecutados y verdes + controles positivos
  + tabla de mutaciones; R1051 queda para el CI del PR, como corresponde.
- [x] **R1045 (nada debilitado).** Por archivo, `it` antes→después idéntico (6,10,3,2,1,5,4,22,18,5,1,5,9,15,9)
  y `expect` sube en todos (+1 a +4). Las únicas líneas `-` con `return`/`expect` son comentarios
  («LANZA, no `return`»). Ningún literal esperado cambiado.
- [x] **R1042 (nada leído sin sembrar).** Sin `fksDeOrden(` en los 15 archivos. Todas las lecturas de
  `orden`/`gestionOrden` que quedan van filtradas por ids o claves sembradas (revisadas una a una:
  `eliminar-orden-*:158/165`, `orden-eliminada-actor-admin:203`, `orden-remision-*:217/271/336/366`,
  `emisor:216/276/313/317`). Catálogos por clave (`rol`, `tipoIdentificacion` «cedula»), lanzando si faltan.
- [x] **`historial-accion-lectura`.** Antes: «los dos primeros usuarios» de la base (roles cualesquiera).
  Ahora: `maestro` y `admin` sembrados. El rol del usuario no entra en lo probado (`actorRol` de la fila
  del historial está fijo a `"maestro"`); solo cambia el `nombre` del fixture (`Prueba <rol>`), que es lo
  que R31 necesita distinto entre A y B. Comprobado con mutación propia (abajo): mismos roles → R31 rojo.
  El tope de descarga sigue medido con `total` (comentario actualizado, aserción intacta).
- [x] **`emisor-relaciones-anidadas` (R1043).** Gestión CONFIRMADA en organización propia
  (`SLT180 emisor <uuid>`) bajo `bajoLockDeEscrituraReal`; control `count == 1` con mensaje; `afterAll`
  borra con `limpiarEmpresas` y afirma `{organizacion,usuario,orden,gestion} = 0`. Paso 4 lee esa gestión
  por id y sigue afirmando `toHaveLength(1)` + sonda. Comprobado en base B tras correr: 0 organizaciones
  `SLT180 emisor%`, y los conteos de la empresa ajena intactos (org 1, usuario 6, orden 40, zona 2,
  gestión 40, api_key 1 — idénticos a la bitácora).
- [x] **Controles positivos.** Cuentan en la base las filas sembradas por id (no comparan contra la
  función que las genera); mensajes con «SLT-180: … sembrada no esta en la base».
- [x] **Baseline (R1047/R1048).** −14 claves, todas del alcance; ninguna otra entrada cambia.
  `orden-traspaso-migration` se queda (decisión del leader → SLT-187 «Tests de migración desfasados tras
  SL-17»): motivo con clase, error, `:114` y `:294`, fecha 2026-11-17 y ficha; ambas líneas comprobadas
  en HEAD (`:114` = `expect(posteriores).toEqual([`, `:294` = `expect(Object.keys(porNombre).sort()).toEqual([`).
  `desde` = `2026-10-22`, igual que en `origin/dev`.
- [x] **Typecheck** `pnpm run typecheck` exit 0. **Lint** `eslint` sobre los 15 archivos exit 0.
- [x] **Reglas del proyecto (perfil reviewer).** Sin `db/`, pantallas ni dinero en el diff (no aplica E2E);
  sin literales de país/moneda ni Ordenex en líneas añadidas; sin dependencias nuevas.
- [ ] **`gate-completo` del CI** (R1051): pendiente del PR; no lo corre el reviewer.

## Verificación propia (base `servi_slt180b_desechable`, con empresa ajena)

- `vitest run` de `historial-accion-lectura`, `emisor-relaciones-anidadas`, `api-key-eliminabilidad`,
  `notificacion-bloqueo-otro-cierre-avisa`: **4 archivos, 33/33 passed**, exit 0.
- Conteo posterior de la base B (script fuera del repo, sin imprimir URL): sin restos de `emisor`;
  empresa ajena intacta.
- **Mutación propia:** `historial-accion-lectura`, actor B sembrado como `maestro` en vez de `admin`
  → 1 failed / 17 passed: «⭑ R31: el termino alcanza el NOMBRE DE LA PERSONA que actuo». Restaurado con
  `git checkout --`; `git status --porcelain` vacío.

## Hallazgos

- `menor` — Algunos comentarios añadidos pasan de 100 columnas (p. ej. `historial-accion-lectura.test.ts`
  ~L418, «Desde SLT-180 es un usuario sembrado…» pegado a una línea ya larga). No hay prettier en el
  proyecto y el lint pasa; solo estética. No bloquea.

Sin bloqueantes.

## Veredicto

**OK**
