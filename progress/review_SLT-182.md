# Review SLT-182 «Usuarios propios en tests de dinero y conciliación»

Rama `feature/SLT-182-usuarios-tests-dinero`, HEAD `e7ec0fa2`, contra `origin/dev`. Ruta ligera (solo
`requirements.md`). Revisado el 2026-11-17.

## Checklist

- [x] **Ruta.** Ligera válida: el diff no toca código de producción (`git diff --name-only origin/dev...HEAD`
  fuera de `tests/`, `progress/`, `specs/`: vacío). Sin dinero/permisos/auth/integraciones en producción.
- [x] **Lo que ya existe.** Presente y con contenido; reutiliza `crearUsuarioDePrueba` y no re-crea nada.
  `_postgres-real.ts`, `454/_escenario.ts` y `_fixtures/orden-minima.ts` sin cambios.
- [x] **Tasks.** T1-T8 en `[x]` (0 `[ ]`).
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 16/40 archivos, 0/1000 producción, 541/3000 tests (exit 0).
- [x] **Typecheck** (`pnpm run typecheck`, exit 0) y **lint** de los 15 archivos (`eslint`, exit 0).
- [x] **R1085 — nada debilitado.** Recuento `it/test` y `expect(` base→HEAD por archivo: iguales en 14;
  `gasto-fijo-cobro-aprobacion` 12→13 `it` y 52→56 `expect` (el caso nuevo de limpieza). Ninguna
  línea quitada con `expect`/literal esperado salvo el caso «contexto mínimo» de
  `analitica-financiera-action`, que se conserva con las mismas dos aserciones dentro de la tx.
  Ningún importe tocado.
- [x] **R1082 — usuarios propios con su rol.** Los 15 usan `crearUsuarioDePrueba(tx, <rol>)` con el rol
  del caso (adminSatelite, mensajero, maestro, admin+maestro, adminTienda…). Ningún
  `findFirst`/`findMany`/`LIMIT n` sin `where` sobre usuario/zona/orden/tarifa/cierre queda en los 15.
  `ranking-snapshot-migration` bloque B: rol y `cedula` por clave (antes `LIMIT 1`).
- [x] **R1083 — filas confirmadas.** `gasto-fijo-cobro-aprobacion` (R18 concurrente): empresa + 2 maestros
  commiteados, borrados en el `finally`, y caso nuevo que exige 1 empresa/2 usuarios registrados y 0 en
  la base. `ranking-snapshot-migration` bloque C: empresa + 2 mensajeros commiteados, borrados en
  `afterAll` tras el `DROP SCHEMA`, con recuento por id que lanza si queda alguno.
- [x] **R1084 — controles positivos.** `count({ where: { id } })` contra los ids sembrados, con mensaje
  que nombra la fila. No comparan contra su propia fuente.
- [x] **R1087/R1088 — baseline.** 128→117: retiradas exactamente las 11 verdes, ninguna añadida, ninguna
  entrada ajena cambia. Las 4 que quedan cambian solo `motivo`; `desde` intacto (comprobado por script).
  Líneas citadas verificadas en HEAD: `analitica-financiera-action.test.ts:325` (llamada a la action;
  la pila medida pasa por `analitica-financiera.ts:106` → `ReglasPaisEmpresaService.ts:89`, igual que
  el motivo), `marca-conciliacion.int.test.ts:272` (`toBe("updated")`),
  `premio-ranking-devengo-migration.test.ts:117` (`toHaveLength(8)`),
  `ranking-snapshot-migration.test.ts:992` (`esP2002).toBe(true)`). Fichas: SLT-185, SLT-195,
  SLT-187 ×2, según decisión del leader.
- [x] **R1090/R1092.** Diff de producción vacío; tamaño bajo el tope sin `tamano-pr-aceptado`.
- [ ] **R1091.** `gate-completo` del PR: pendiente (lo corre el CI).
- [x] **Trazabilidad.** Mapa R→evidencia en `progress/impl_SLT-182.md > Mapa R → evidencia`; cada R tiene
  test/evidencia concreta (R1089 no aplica: ningún helper tocado).
- [x] **Checkpoints del proyecto.** Sin tablas, migraciones, queries de negocio nuevas, dependencias,
  secretos ni recursos de Ordenex. E2E afectados: no aplica (sin código de producción ni pantallas).

## Verificación propia (base `servi_slt182b_desechable`, con empresa ajena confirmada)

- `vitest run` de 5 retirados/afectados: `gasto-fijo-cobro-aprobacion` 13/0/0, `wallet-tienda-cobro`
  13/0/0, `corregir-conciliacion.int` 10/0/0; `ranking-snapshot-migration` 48/1/0 (solo R12, la causa del
  motivo); `analitica-financiera-action` 2/13/0 (los 13 con `EmpresaNoResuelta: Sin empresa en contexto
  para Pais.zonaHoraria`, la causa del motivo).
- Recuento tras la corrida (incluye los dos bloques commiteados): `organizacion 1, usuario 5, zona 2,
  historial_accion 0, gasto_fijo_cobro 0`, 0 esquemas `t196_%`: no quedan filas sembradas.
- **Mutación propia:** en `gasto-fijo-cobro-aprobacion` quité el `usuario.deleteMany` de
  `borrarEmpresaSembrada`. Resultado 11/2/0: el caso concurrente cae (`organizacion` RESTRICT por
  `usuario_organizacion_id_fkey`) y el caso nuevo de limpieza cae (`expected 1 to be +0`). El control de
  R1083 detecta la fuga. Árbol restaurado (`git checkout`, `git status` limpio) y las 2 filas de usuario
  + 1 de empresa que dejó la mutación borradas a mano de la desechable (recuento vuelve a 1/5).

## Hallazgos

- **menor** — `progress/impl_SLT-182.md > Siguen rojos por OTRA causa` aún dice «a confirmar por el
  leader» para `marca-conciliacion.int` (SLT-195) y `premio-ranking-devengo-migration` (SLT-187); el
  leader ya las confirmó. Solo texto de la bitácora; no lo edito (el reviewer solo escribe este archivo).
- **menor** — En `ranking-snapshot-migration` bloque C, el recuento de 0 filas vive en el `afterAll` (no
  en un `it`): si falla, el archivo sale rojo, que es lo que pide R1083; y si el `DROP SCHEMA` lanzara,
  `borrarSembrados` no correría, pero el archivo también saldría rojo. Aceptable; se anota.
- **menor** — El caso «contexto mínimo» de `analitica-financiera-action` pasa a comprobar el contexto
  sembrado (que ya lanza si falta), así que es casi tautológico. Mismas aserciones, no se debilitan
  respecto al contrato de R1085.

Sin bloqueantes.

## Veredicto

**OK** (R1091 queda al `gate-completo` del PR).
