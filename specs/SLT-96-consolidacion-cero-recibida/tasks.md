# SLT-96 «Consolidación de ₡0 no se puede marcar recibida» · tasks (HOTFIX)

Rama `feature/SLT-96-consolidacion-cero-recibida` desde `origin/prod`, en el worktree
`.worktrees/SLT-96-consolidacion-cero-recibida`. Para cada `R<n>`, el test y la mutación que lo mata
están en `requirements.md > Trazabilidad`. `[P]` = puede ir en paralelo con las demás que estén listas.

- `node_modules` es compartido con `dev`: no correr `prisma generate` aquí (no hace falta: sin cambios de esquema).
- Sin migraciones ni dependencias.
- **Copiar `.env` al worktree antes del primer test:** sin él, INT se salta y el gate sale verde sin
  haber probado la lectura del declarado.
- Los datos de los tests son sembrados y se revierten. Nada de datos de producción.

## T1 · Servidor: el borde y el repositorio (R1-R9)

Dep.: —

- [ ] `lib/types/conciliacion-satelites.ts`: `montoCeroSchema`, `montoRecibidoSchema`,
      `MENSAJE_MONTO_RECIBIDO_FORMA`, `MENSAJE_MONTO_CERO_CON_DECLARADO`; `marcarConsolidacionRecibidaSchema`
      usa `montoRecibidoSchema` y sigue `.strict()`; comentario de la 431 reescrito (`design.md` §2.1).
- [ ] `lib/interfaces/repositories/ICierresBodegaAdminRepository.ts`: `MarcaConMontoResult` y los dos
      métodos que lo devuelven; comentarios de los dos inputs (§2.2).
- [ ] `lib/repositories/CierresBodegaAdminRepository.ts`: `declaradoEsCero` y su uso en `marcarConciliado`
      y `corregirConciliacion`, dentro de la transacción, antes del `updateMany` y solo con monto 0.
- [ ] `lib/interfaces/services/IConciliacionSatelitesService.ts` y `lib/services/ConciliacionSatelitesService.ts`:
      `MarcaConMontoServiceResult` y la traducción a `validation_error` (§2.3).
- [ ] `lib/actions/conciliacion-satelites.ts`: solo comentarios (§2.4).
- [ ] Tests:
  - AC: el caso «cero» sale del `it.each` de rechazos y el `it` «el CERO se rechaza a propósito» se
    reescribe. `"0"`/`"0.00"` llegan al servicio; `"-0"`, `"-0.00"` y los rechazos de siempre no, en marcar
    y en corregir (R6); clave `declarado` → `validation_error` (R5); `montoPositivoSchema` sigue
    rechazando `"0"` y `"0.00"` (R8).
  - SV: `monto_cero_no_permitido` → `validation_error` con el literal, en marcar y en corregir (R2, R4);
    `fuera_de_alcance` con `"0.00"` → `no_encontrada` (R9).
  - INT (nuevo, `tests/integration/db/slt96-marca-cero.int.test.ts`, molde de
    `slt73-corregir-diferencia.int.test.ts`): R1, R2, R3, R4, R5, R7 y R9 contra Postgres real, con
    `enTransaccionRevertida`, y siembras de `cierre_bodega` propias (declarado 0 por `1500 − 1500`,
    declarado 5000, id inexistente). Cifras escritas a mano, nunca calculadas con `esperadoDe`.
- **Hecho cuando:**
  - los tres archivos están verdes y cada mutación de su fila quedó medida en rojo, con comando y salida
    en `progress/impl_SLT-96.md`;
  - **INT corrió de verdad:** sin mutar, el informe dice N > 0 tests ejecutados, no `skipped`. Un INT verde
    por `describe.skip` no cuenta;
  - `git diff` no toca `lib/types/wallet.ts`, `lib/utils/conciliacion-satelite.ts`, `asentarDiferenciaSatelite`
    ni `asentarCierreDia`.

## T2 · Pantalla (R10-R13) [P con T1]

Dep.: — (contra el contrato de `design.md` §2.3; se integra al cerrar T1)

- [ ] `components/shared/monto-cliente.ts`: `esMontoCero` movido desde
      `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx`, que lo re-exporta; `montoValidoOCero`.
- [ ] `components/shared/conciliacion/conciliacion-labels.ts`: `MARCAR_RECIBIDO_ERROR.montoConCero`.
- [ ] `components/shared/conciliacion/MarcarRecibidoDialog.tsx`: `declaradoCero`, `montoOk` y el aviso
      del campo (§3); comentario de la línea 160 al día.
- [ ] Tests:
  - MC (nuevo): `esMontoCero` y `montoValidoOCero`, con `"0"`, `"0.0"`, `"0.00"`, `"-0.00"`, `"0.01"`,
    `"10"`, `""`, `"0.000"`.
  - DLG (nuevo): R10, R11 (precargado, tecleado y modo corrección), R12 con un `onMarcar` doble que
    responde el `validation_error` literal, y R13.
- **Hecho cuando:** MC y DLG están verdes, sus mutaciones quedaron medidas en rojo y los cuatro lectores
  de `esMontoCero` en `app/(app)/` compilan sin cambiar sus imports.

## T3 · Gate y mapa

Dep.: T1, T2

- [ ] `./init.sh` en verde, con `INIT_EXIT=$?` escrito dentro del log.
- [ ] Mapa `R1..R13 → test` en `progress/impl_SLT-96.md`, con el nombre de cada `it`.
- **Hecho cuando:** el gate está verde y el mapa no deja ningún `R` sin test.

## T4 · Revisión

Dep.: T3

- [ ] Reviewer: OK. Comprueba en concreto que el declarado sale de la base (R5) y que con monto > 0 el
      repositorio no hace ninguna consulta nueva.
- **Hecho cuando:** el reviewer da OK por escrito en `progress/features/SLT-96.md`.

## T5 · Preparar la salida

Dep.: T4

- [ ] `git fetch origin` y `git diff origin/prod origin/dev --` sobre los «Archivos esperados». Anotar el
      resultado en `progress/impl_SLT-96.md`. Si `dev` cambió alguno, se anota cómo se resolverá al
      sincronizar.
- [ ] El leader abre el PR a `prod` (el implementer no lo abre).
- **Hecho cuando:** el PR está abierto con su URL de Preview y el check `gate-completo` está en verde.

## T6 · Comprobación en el Preview (FINAL)

Dep.: T5

Datos de QA, nunca de producción. Si el Preview no deja entrar con usuarios de QA, se pide a Carlos.

- [ ] En `/wallet/satelites`, una consolidación de QA con declarado ₡0: el diálogo abre con `0,00`, el
      botón está activo, marca, y la fila pasa a «Recibido» con «Falta por recibir» en ₡0.
- [ ] Otra con declarado > 0: con el monto en 0 el botón sigue apagado.
- [ ] Lo mismo desde la cola de `/cierres-admin`.
- **Hecho cuando:** los tres puntos están anotados con su evidencia en `progress/features/SLT-96.md` y
  Carlos aprueba en Preview.

## Después de la T6: merge y sincronía

- [ ] Merge del PR a `prod`, por el humano y con `gate-completo` en verde.
- [ ] Carlos marca recibida la consolidación de Turrialba del 2026-11-07 con ₡0 en producción.
- [ ] Sincronizar `prod` → `dev` y confirmar que `dev` conserva el `.strict()`, `declaradoEsCero` y
      `montoPositivoSchema` sin cambios.

## Archivos esperados

- `lib/types/conciliacion-satelites.ts`
- `lib/interfaces/repositories/ICierresBodegaAdminRepository.ts`
- `lib/repositories/CierresBodegaAdminRepository.ts`
- `lib/interfaces/services/IConciliacionSatelitesService.ts`
- `lib/services/ConciliacionSatelitesService.ts`
- `lib/actions/conciliacion-satelites.ts`
- `components/shared/monto-cliente.ts`
- `components/shared/conciliacion/MarcarRecibidoDialog.tsx`
- `components/shared/conciliacion/conciliacion-labels.ts`
- `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx`
- `tests/unit/actions/conciliacion-satelites-actions.test.ts`
- `tests/unit/services/conciliacion-satelites-service.test.ts`
- `tests/integration/db/slt96-marca-cero.int.test.ts`
- `tests/components/MarcarRecibidoDeclaradoCero.test.tsx`
- `tests/unit/components/monto-cliente-cero.test.ts`
- `progress/impl_SLT-96.md`
- `progress/features/SLT-96.md`
