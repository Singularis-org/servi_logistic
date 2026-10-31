# SLT-65 «Geografía jerárquica: consultas de órdenes, cierres y zonas sobre el nodo»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-65 | geo-jerarquica-consultas | backend | high | feature/SLT-65-geo-jerarquica-consultas | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 hecho (2026-10-31): tomada en Trello y worktree creado. La rama nace de `dev` y lleva mergeado
`feature/SLT-44-geo-jerarquica-dominio` (PR #55, que a su vez lleva SLT-43, PR #44; ninguno
mergeado) como base. F1.1 (`/afinar-feature`) hecho. F1.2 hecho (2026-10-31, spec_author):
`requirements.md` (R1–R28, 4 preguntas abiertas con propuesta), `design.md` y `tasks.md` en
`specs/SLT-65-geo-jerarquica-consultas/`. F1.4: spec aprobado por escrito por Camilo («Nada más; aprobado», 2026-10-31) y las 4 preguntas
abiertas cerradas; tarjeta movida a «En curso». Siguiente: F2.1, implementer.

## Evaluación
- zone `backend`; complexity `high` fijada por el leader: toca lecturas de dinero (cierres,
  cobro de devoluciones) y la re-derivación de zonas.
- Dependencia SLT-44: PR #55 con CI verde y review aprobada, pendiente de T7.2 y del merge humano.
- Cupo backend de Camilo: 4/3 con esta. Excepción aceptada por el humano el 2026-10-31: SLT-43 y
  SLT-44 están abiertas pero en pausa hasta probar.

## Decisiones
- 2026-10-31 · Alcance y decisiones cerradas en `specs/SLT-65-geo-jerarquica-consultas/requirements.md`.
- 2026-10-31 · Se parte en dos: tránsito, analítica, ciclo de vida y gestión de orden van a SLT-71
  (nueva). SLT-46, SLT-47 y SLT-48 dependen también de SLT-71.
- 2026-10-31 · F2.1, tanda de órdenes (T0–T2): Camilo autoriza actualizar los tres literales que congelan la forma del `select` («Sí, actualizar los literales», Camilo, 2026-10-31). ABIERTO para el leader: en `gestiones-detalle-api-405.test.ts` (baseline, no corre hasta SL-31) la carga del catálogo se hace una vez por instancia del repositorio. Por eso la 1.ª lectura emite 18 consultas y la 2.ª, 12, y `toHaveLength(14)` y la comparación con/sin gestiones fallarán con datos sea cual sea el literal. Hay que decidir si se precarga el catálogo antes de medir o si se mide aparte. En los dos casos cambia un `expect` que no está autorizado.
- 2026-10-31 · T3 (c10045e). ABIERTO: `emisor-relaciones-anidadas.test.ts` (en la baseline, base vacía) espera 1 lectura de `provincia` (ahora habrá 0) y 1 de `zona` (habrá 2 con la carga del catálogo). Fallará cuando corra con datos. Hace falta decidir si se enmiendan esos dos literales.
- 2026-10-31 · T4 (T4.1 y T4.3 hechas; T4.2 sin marcar). ABIERTO, 3 `expect` de salida que chocan con design §6.1 y que NO se han tocado: `zona-repository.test.ts:~644` (lee `where.distritoId.in` de la 2.ª llamada a `zonaDistrito.findMany`, que ahora es la carga del catálogo); `zona-repository.test.ts:~732` (`BASE_D1_ZA` congela `distritoId: {in}`, y el design pide `whereLugarEn`); la guardia `zona-reconciliacion-no-retarifa.guardia.test.ts:157` (su antivacío exige `orden.findMany(` dentro de `update`; la lectura se ha ido a `planificarReconciliacion`). Hace falta decidir si se enmiendan.
- 2026-10-31 · ABIERTO para SLT-44: `CatalogoGeograficoRepository.enUnaFoto` pasa la constante `OPCIONES_TRANSACCION` a `$transaction`, y Prisma 7 le escribe `newTxId`. Una vez que se abre un `tx` anidado, la siguiente carga cae con «Transaction already closed». En SLT-65 se rodea con `lib/repositories/_shared/sin-transaccion-anidada.ts` (cierres y zonas). El arreglo de raíz es una línea en SLT-44 (`{ ...OPCIONES_TRANSACCION }`) y no se ha aplicado aquí.
- 2026-10-31 · F2.1, implementer: T0–T6, T7.1–T7.2 y T8.1 hechas. Sin marcar: T4.2 y T7.3 (por los 3 `expect` de zonas abiertos), T8.2 (`./init.sh` corta en el cupo backend 4/3, excepción humana que el validador no conoce), y T8.3/T9 (puerta humana). En `lib/db/excepciones-aislamiento.ts` entran dos excepciones de plataforma para los scripts de consola (T5.1); hay que avisar al reviewer. `geo:explain-consultas` en local marca regresión en los dos listados (+227 %, +412 %) con una base mínima; quien decide es T8.3 sobre la copia de producción. Los scripts solo corren contra localhost (no tienen `--forzar`), así que para T8.3 hay que restaurar la copia en local. Bitácora: `progress/impl_SLT-65.md`.
