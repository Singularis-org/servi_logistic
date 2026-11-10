# SLT-85 «Traza de facturación de los cobros por orden»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-85 | traza-facturacion-cobros | backend | medium | feature/SLT-85-traza-facturacion-cobros | Camilo | done |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
done (2026-11-09): PR #103 mergeado en dev (30b40d7d), gate-completo verde.

## Evaluación
- zone backend: tabla nueva, migración con relleno de históricos, escritura junto al movimiento de cobro. Sin pantalla.
- complexity medium; ruta completa (dinero y migración).
- Toca lo de SL-40, SLT-66, SLT-83 y el período de SLT-86.

## Decisiones
- 2026-11-09 · Alcance y decisiones → `specs/SLT-85-traza-facturacion-cobros/requirements.md`. Tarjeta de Trello actualizada con el período (sí del humano).

- 2026-11-09 · F1.2: spec escrito (R1–R27; trigger AFTER INSERT sobre `cobro_plataforma_movimiento`, tabla `cobro_plataforma_traza`, relleno con `reconstruido`). Humano: P1 plan al cobrar, P2 período de los históricos con el tipo de hoy, P3 borrado igual que los movimientos, P4 down.sql se niega si hay filas en vivo. Todas = recomendación de spec_author.

<!-- tamano-pr-aceptado: 2026-11-09 · ~1.100–1.300 líneas, casi todo tests de integración; partir dejaría el reverso de cargos viejos sin traza en producción. Humano: «Aceptar en un PR». -->

- 2026-11-09 · (humano, tras implementar) Un reverso histórico sin su cargo hace fallar la migración (R19 tal cual). ANTES del deploy a producción se cuenta en prod cuántos reversos no tienen cargo; con 0 se despliega, con más se decide con el dato. Leader acepta las propuestas técnicas 1–3 del implementer: `trazas[]` en Prisma (1 a 1 por el único SQL), el CHECK de `reverso_de` que también hace fallar el movimiento, y que la inmutabilidad deje pasar el cambio de empresa para que salga SL017 (R26).

- 2026-11-09 · F2.2 vuelta 1 (9c65e6d0): RECHAZADO. B1 guardia `catalogo-postgres-acota-esquema` (consultas del test de ida y vuelta sin acotar esquema); B2 falta cierre (E2E locales). Leader: se corrigen B1, m1 (LOCK en down.sql) y m3 (design `trazas[]`); los E2E del grupo dinero se corren en local; `./init.sh` lo sustituye el gate-completo en CI (preferencia del humano). m2 (con BEGIN explícito, un fallo de `migrate deploy` muestra 25P02 en vez del error real): es aviso de operación para el deploy a producción, no se cambia.

- 2026-11-09 · F2.2 vuelta 2 (305b32c8): OK, 0 bloqueantes. Arreglos 9fe97705, 9fe70dc3, 607bfa35, 8b6b601b; E2E locales dinero 84/0 y aislamiento 25/0. Integrado origin/dev sin conflictos. PR a dev.

## Preguntas abiertas
Ninguna.

## Tandas
- 2026-11-09 · T1–T5 · f4317328, bd499da6, 5a789878, c972899c, 0053975d · R1–R27 con test; vitest contra Postgres 71/71 (3 nuevos + suites de SL-40 y SLT-83); ida y vuelta de la migración con 19 movimientos: el libro sale idéntico y la traza cuadra 19/19; el down se niega con filas en vivo. Typecheck y guardias tenían rojos por `libphonenumber-js`, que faltaba en el node_modules del checkout principal: el leader corrió `pnpm install --frozen-lockfile`. La base `servi_logistic_slt85` se tiene que recrear antes de reutilizarla.

## Modelos (overrides)

## Cierre
- 2026-11-09 · PR https://github.com/Singularis-org/servi_logistic/pull/103 mergeado por el humano en dev (30b40d7d). `gate-completo` verde.
- Resumen: tabla `cobro_plataforma_traza`, con una fila por cargo y por reverso de `cobro_plataforma_movimiento`. La escribe un trigger AFTER INSERT en la misma transacción. Guarda la copia del momento (guía, monto, estado, regla fija o porcentual, fuente, plan al cobrar, período de SLT-86) y es de solo escritura (SELECT para la app, SL085, SL017). La migración `20261109120000` rellena los históricos con `reconstruido` y su down.sql se niega si hay filas en vivo.
- Revisión F2.2: vuelta 1 rechazada (guardia sin acotar el esquema y E2E sin correr), vuelta 2 OK.
- Deuda y avisos que deja: ANTES del deploy a producción hay que contar los reversos sin cargo (con más de 0, la migración falla entera). Con BEGIN explícito, un fallo de `migrate deploy` muestra 25P02 en lugar del error real.
- Baseline: nada que podar (el CI no lista entradas que ya pasen).
- Bases locales `servi_logistic_slt85` y `servi_logistic_slt85_e2e`: pendientes de borrar con autorización.
