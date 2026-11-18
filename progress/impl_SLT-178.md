# impl SLT-178 «Siembra propia en los tests de cierres» — bitácora (backend_dev, 2026-11-17)

Spec: `specs/SLT-178-siembra-tests-cierres/requirements.md` (R1000–R1012). Solo `tests/` y
`tests/baseline-rojos.json`; ningún archivo de producción, ni `_postgres-real.ts`, ni
`454/_escenario.ts`, ni `_fixtures/orden-minima.ts` (no hizo falta función nueva: R1009 no aplica).

## Entorno
- Worktree al día con `origin/dev` (`5b9b23de`, ya estaba). `.env` y junction `node_modules` presentes (no se leyó el `.env`).
- Bases desechables por `scratchpad/con-desechable.cjs` (sin imprimir URLs), todas `migrate deploy` (331 migraciones) + `pnpm run db:seed`:
  - `servi_slt178_desechable` — base vacía (R1000).
  - `servi_slt178b_desechable` — + empresa ajena CONFIRMADA (R1001): script fuera del repo (copia de `slt177-otra-empresa.tmp.ts`): 1 organización, zona central + satélite, tarifas, 5 usuarios (tienda, maestro, 2 mensajeros, adminSatelite), 40 órdenes (una por estado y zona); más 2 `cierre_dia` `solicitado` de sus mensajeros y 4 gestiones sueltas (SQL fuera del repo).
  - `servi_slt178c_desechable` — base vacía + `ayuda_tienda` y `devolucion_por_confirmar` añadidos a mano a `order_status` (solo para medir los 3 que caen por estado retirado y sus mutaciones).

## T1 — antes (base vacía, JSON de vitest; p/f/s)
Los 17 en el baseline citando SLT-178; los 17 rojos: el archivo falla en el `beforeAll` (`fksDeOrden` → «la tabla `orden` esta vacia») y todos sus casos salen saltados.

| archivo | antes | después (base vacía) | después (empresa ajena) |
|---|---|---|---|
| cierre-aprobacion-libera-solo-lo-suyo | 0/0/2 | 2/0/0 | 2/0/0 |
| cierre-aprobar-el-mas-viejo-desbloquea | 0/0/1 | 1/0/0 | 1/0/0 |
| cierre-bloqueo-nv-sql-real | 0/0/18 | 18/0/0 | 18/0/0 |
| cierre-descarga-fechas-sql-real | 0/0/3 | 3/0/0 | 3/0/0 |
| cierre-descarga-intentos-entrega-sql-real | 0/0/4 | **rojo** (estado retirado) | **rojo** (ídem) |
| cierre-excluye-gestiones-de-escritorio | 0/0/6 | 6/0/0 | 6/0/0 |
| cierre-rechazado-aviso-dedupe | 0/0/6 | 6/0/0 | 6/0/0 |
| cierre-rechazado-jornada-sql-real | 0/0/6 | 6/0/0 | 6/0/0 |
| cierre-rechazo-tienda-aprobacion | 0/0/16 | 16/0/0 | 16/0/0 |
| cierre-rechazo-tienda-sql-real | 0/0/8 | 8/0/0 | 8/0/0 |
| cierre-rechazo-tienda-totales | 0/0/6 | 6/0/0 | 6/0/0 |
| cierre-segundo-vincula-solo-lo-suyo | 0/0/1 | 1/0/0 | 1/0/0 |
| cierre-sin-gestion-sql-real | 0/0/9 | 9/0/0 | 9/0/0 |
| cierre-sin-gestion-tope-sql-real | 0/0/9 | **rojo** (estado retirado) | **rojo** (ídem) |
| cierres-admin-retornables-sql-real | 0/0/5 | 5/0/0 | 5/0/0 |
| cierres-filtro-estado-sql-real | 0/0/7 | 7/0/0 | 7/0/0 |
| corte-diario-segundo-cierre-sql-real | 0/0/4 | **rojo** (estado retirado) | **rojo** (ídem) |

**14 verdes, 0 saltados, en las dos bases** (R1000, R1001). Tras cada corrida la base vacía vuelve a
0 organizaciones/usuarios/zonas/cierres/notificaciones/órdenes, y la ajena a sus mismos conteos
(1/5/2/2 cierres/4 gestiones/40 órdenes): 0 filas propias confirmadas (R1003).

### Los 3 que siguen rojos (R1008) — causa medida: estado retirado del catálogo
Sembrados según R1002, ahora caen en el `beforeAll` al pedir un estatus que la 454 retiró y una base nueva no trae:
- `corte-diario-segundo-cierre-sql-real` → «falta el estatus «ayuda_tienda»» (`:108`).
- `cierre-descarga-intentos-entrega-sql-real` → «falta el estatus «devolucion_por_confirmar»» (`:165`).
- `cierre-sin-gestion-tope-sql-real` → «falta el estatus «devolucion_por_confirmar»» (`:182`).

Con esos dos estatus añadidos a mano (`servi_slt178c`, y en `servi_slt178b` con la empresa ajena) pasan
4/4, 4/4 y 9/9: la siembra está bien y lo único que falta es el catálogo. Ninguna de SLT-185/187/188/195
cubre esta causa; la cubre **SLT-186 «Tests con estados retirados del catálogo»** (el baseline ya cita
SLT-186 para `satelite-bodega-alcance-real` por `ayuda_tienda`). Motivo reescrito citando SLT-186,
`desde` intacto. **Desviación de la lista de R1008 a confirmar por el leader.**

## Qué se sembró (T2–T4)
Patrón: `fksDeOrden(prisma)` y `usuario.findFirst/findMany` salen del `beforeAll`; dentro de la tx de
cada caso, `crearFksDeOrden(tx)` (tienda + zona) y `crearUsuarioDePrueba(tx, rol)`; las FK de catálogo
del usuario se leen por clave (`rol.mensajero`, `tipoIdentificacion.cedula`). Control positivo con
mensaje que nombra la fila (`expect(count, "usuarios sembrados (…)").toBe(n)`, `"zona sembrada"`).

| archivo | siembra en la tx del caso | control positivo |
|---|---|---|
| aprobacion-libera, aprobar-el-mas-viejo, segundo-vincula, sin-gestion, sin-gestion-tope | fks + mensajero(s) + admin (`maestro`) | usuarios = 3, zona = 1 |
| bloqueo-nv | `sembrarBaseDelCaso`: fks + 3 mensajeros (18 casos) | usuarios = 4, zona = 1 |
| rechazado-jornada | fks + mensajero | usuarios = 2, zona = 1 |
| descarga-fechas, descarga-intentos, excluye-gestiones, filtro-estado, rechazo-tienda-sql-real, rechazo-tienda-totales | fks (`sembrarBaseDelCaso`) | tienda = 1, zona = 1 |
| admin-retornables | fks; el usuario de FK es la tienda sembrada | tienda = 1, zona = 1 |
| rechazo-tienda-aprobacion, corte-diario | fks + zona CENTRAL de la empresa del caso; el caso corre como `servi_app` (`comoApp`) porque el código lee la central globalmente (`findCentralZonaId`) | zonas = 2, centrales visibles = 1, tienda = 1 |
| rechazado-aviso-dedupe | **confirmada** (R1003): R9 usa dos conexiones concurrentes y una autocomprobación lee fuera de tx. `beforeAll` crea organización propia + fks + 2 mensajeros en una `$transaction` que confirma; los casos con tx revertida usan `{ organizacionId }`; R9 escribe con el cliente de la app (`conAislamientoPorEmpresa` + `conEmpresa`). `afterAll` borra notificaciones, cierres, usuarios, zona y organización y cuenta 0. | `beforeAll` lanza si usuarios ≠ 3 o zona ≠ 1; `afterAll` lanza si queda alguna fila |

R1005: ningún `it`/`test` ni `expect` quitado (conteo por archivo origin/dev → HEAD: mismos `it`, `expect` +2/+3 por los controles); ningún literal esperado cambiado.

## T6 — mutaciones (una a una; `git checkout --` tras cada una; árbol limpio)
Tipo «mensajero»: el primer `crearUsuarioDePrueba(tx, "mensajero")` se cambia por un id inexistente. Tipo «zona»: el primer `crearFksDeOrden(tx)` devuelve `zonaId` inexistente. Base: A = vacía, C = vacía + estados retirados.

| archivo | mutación | base | resultado |
|---|---|---|---|
| aprobacion-libera-solo-lo-suyo | mensajero | A | 2/2 rojos: «usuarios sembrados (tienda, mensajero, admin): expected 2 to be 3» |
| aprobar-el-mas-viejo-desbloquea | mensajero | A | 1/1 rojo: ídem |
| bloqueo-nv-sql-real | mensajero (los 3 del bucle) | A | 18/18 rojos: «usuarios sembrados (tienda + 3): expected 1 to be 4» |
| segundo-vincula-solo-lo-suyo | mensajero | A | 1/1 rojo: «usuarios sembrados (tienda, mensajero, otro mensajero): expected 2 to be 3» |
| rechazado-aviso-dedupe | mensajeroB (siembra confirmada) | A | archivo rojo en `beforeAll`: «la siembra confirmada dejo 2 usuarios (tienda, A, B), no 3»; base en 0 filas después |
| rechazado-jornada-sql-real | mensajero | A | 5 rojos (el 6.º no siembra: «cierre inexistente»): «usuarios sembrados (tienda, mensajero): expected 1 to be 2» |
| rechazo-tienda-sql-real | zona | A | 8/8 rojos: «zona sembrada: expected +0 to be 1» |
| rechazo-tienda-totales | zona | A | archivo rojo en `beforeAll`: ídem |
| rechazo-tienda-aprobacion | zona | A | archivo rojo en `beforeAll`: «zonas sembradas (la de las ordenes y la central): expected 1 to be 2» |
| descarga-fechas-sql-real | zona | A | 3/3 rojos: «zona sembrada» |
| excluye-gestiones-de-escritorio | zona | A | 6/6 rojos: «zona sembrada» |
| sin-gestion-sql-real | mensajero | A | 9/9 rojos: «usuarios sembrados (tienda, m1, m2): expected 2 to be 3» |
| admin-retornables-sql-real | zona | A | 5/5 rojos: «zona sembrada» |
| filtro-estado-sql-real | zona | A | 7/7 rojos: «zona sembrada» |
| descarga-intentos-entrega | zona | C | 4/4 rojos: «zona sembrada» |
| sin-gestion-tope-sql-real | mensajero | C | 9/9 rojos: «usuarios sembrados (tienda, mensajero, admin): expected 2 to be 3» |
| corte-diario-segundo-cierre | zona | C | 4/4 rojos: «zonas sembradas (la de las ordenes y la central): expected 1 to be 2» |

## T7 — baseline
152 → 138 entradas: salen las 14 verdes; las 3 rojas se quedan con el motivo reescrito (clase, error,
`archivo:línea`, fecha 2026-11-17, SLT-186) y `desde` intacto. Ninguna otra entrada cambia.

## Archivos modificados
- `tests/integration/db/` — los 17 del alcance.
- `tests/baseline-rojos.json`.
- `progress/impl_SLT-178.md` (esta bitácora).

## Mapa R → evidencia
| R | evidencia |
|---|---|
| R1000 | tabla T1, columna «base vacía»: 14 verdes, 0 saltados |
| R1001 | columna «empresa ajena»: idénticos; los 3 rojos, verdes con el catálogo completo en la base ajena |
| R1002 | diff: sin `fksDeOrden` ni lectura de `usuario`/`zona`/`orden` sin id sembrado en los 17 |
| R1003 | `cierre-rechazado-aviso-dedupe`: `afterAll` cuenta 0; conteos de las bases tras cada corrida |
| R1004 | controles positivos de la tabla «Qué se sembró»; catálogo ausente → lanza con el nombre |
| R1005 | conteo `it`/`expect` origin/dev → HEAD; ningún `-…expect(` en el diff |
| R1006 | tabla T6 (17/17 rojas) |
| R1007 | `git diff tests/baseline-rojos.json`: −14 claves del alcance, 3 motivos reescritos |
| R1008 | los 3 de estado retirado → SLT-186 (desviación anotada arriba) |
| R1009 | no aplica: no se tocó ningún helper compartido |
| R1010 | `git diff --name-only origin/dev -- lib/ app/ components/ hooks/ db/ scripts/ .github/ package.json` vacío |
| R1011 | pendiente del CI del PR |
| R1012 | `scripts/tamano-pr.mjs` (ver Salidas) |

## Salidas
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .` → exit 0, 0 errores.
- `pnpm exec eslint <17 archivos>` → exit 0, sin avisos.
- `git diff --name-only origin/dev -- lib/ app/ components/ hooks/ db/ scripts/ .github/ package.json` → vacío.
- `node scripts/tamano-pr.mjs` → 18/40 archivos, 0/1000 producción, 798/3000 tests.

## Gate (`./init.sh` sobre `servi_slt178_desechable`)
- 1.ª corrida: `INIT_EXIT=1`. Único rojo: `tests/unit/guards/otp-debug-solo-en-pruebas.guardia.test.ts`
  «Test timed out in 20000ms» (29 s) con otro gate en paralelo en la máquina. Solo: 11/11 en 3,5 s. No lo
  toca este diff (barre el árbol versionado).
- 2.ª corrida: **`INIT_EXIT=0`**. typecheck y lint verdes (lint: 0 errores, 248 avisos previos), 384
  archivos del rápido verdes, 138 heredados del baseline, tamaño 18/40 · 0/1000 · 798/3000.

## Veredicto
14 de 17 fuera del baseline, verdes en base vacía y con empresa ajena; 3 se quedan por estado retirado
citando SLT-186 (a confirmar por el leader); 17/17 mutaciones rojas; gate local verde.

## Tanda review (2026-11-17, `progress/review_SLT-178.md`)
- B1: `requirements.md > ## Tasks` con T1–T8 en [x]; T8 con «CI del PR pendiente (R1011)».
- m1: el `afterAll` de `cierre-rechazado-aviso-dedupe` suma al recuento que debe quedar en 0 la zona sembrada (`zona.count({ id: fks.zonaId })`) y las `notificacion_lectura` de sus avisos.
  - En `servi_slt178b_desechable` (con la empresa ajena): 6/6 verdes; conteos de la base iguales antes y después (1 org, 5 usuarios, 2 zonas, 2 cierres, 4 gestiones, 40 órdenes).
  - Mutación: sin borrar la zona (y por eso sin poder borrar la organización: FK RESTRICT `zona_organizacion_id_fkey`) → archivo rojo en el `afterAll`: «la siembra confirmada dejo 2 filas en la base» (zona + organización). Restaurado con `git checkout --`; las 2 filas que dejó la mutación se borraron a mano en la desechable.
  - Primera prueba de la mutación (solo sin borrar la zona) cayó antes del recuento, en el borrado de la organización por la misma FK: también rojo, pero no ejercía el recuento; por eso la mutación final deja las dos.
