# SLT-64 · bitácora de implementación

Alcance R1–R17. T1 → T2 hechas por `backend_dev`; consolidado por el leader, porque el implementer
fue cortado por el hook `handback-send-enforce` mientras esperaba a su subagente.

## T1 → T2 (hasta 99abb72d)

### Archivos

- **Creados:** `tests/integration/db/ciclo-vida-gestion-final.int.test.ts`,
  `tests/unit/analytics/ciclo-vida-resultados-de-cierre.guardia.test.ts`.
- **Lógica o contrato:** `lib/repositories/CicloVidaRepository.ts`, `lib/types/conteo-ciclo-vida.ts`.
- **Solo comentarios:** `lib/interfaces/repositories/ICicloVidaRepository.ts`,
  `lib/actions/ciclo-vida.ts`, `lib/analytics/entregas-conteo.ts`,
  `lib/repositories/CohorteCargaRepository.ts`, `lib/repositories/ventana-de-carga.ts`,
  `app/(app)/analitica/_components/entregas/CicloVidaKpi.tsx`,
  `tests/integration/db/cohorte-carga-ventana.int.test.ts`,
  `tests/integration/db/cohorte-carga-reloj.int.test.ts`,
  `tests/unit/analytics/cohorte-terminales.guardia.test.ts`.
- **Tests actualizados:** `tests/unit/analytics/ciclo-vida.test.ts`,
  `tests/integration/db/455/caracterizacion/sql-crudo-conteos.test.ts`.

### Mapa R → test

Los casos de R1–R9 y R11 están en `ciclo-vida-gestion-final.int.test.ts`; sus nombres empiezan por
el requisito. R10 está en `ciclo-vida-resultados-de-cierre.guardia.test.ts`.

### Mutaciones (17/17 matadas)

| Mutación | Caso que la mató |
|---|---|
| a. leer historial | R1 `entregado` sin historial |
| b. sin filtro de resultados | R2 `reprogramado` |
| c. sin `NOT EXISTS` | R5 `entregado` dentro |
| d. ventana en el `NOT EXISTS` | R5 `entregado` dentro |
| e. sin `anulada_at` en el `NOT EXISTS` | R7 `novedad` de D2 |
| f. sin `anulada_at` externo | R7 `entregado` de D2 |
| g. fin = instante de la corrección | R8 |
| h. sacar la devolución de la lista | R8 (también R1 y R11) |
| i. sin `g2.id` | R3 empate |
| j. sin `condicionDeAlcance` | R9 «recorta por si sola». Sobrevivió la primera vez; se reforzó el test |
| k. sin `deleted_at` | R9 borrada |
| l. sin `EXISTS` de mensajero | R9 mensajero |
| m1. sin `comoApp` | R9 otra empresa |
| m2. RLS desactivada en la tx | R9 otra empresa |
| extra: ventana sobre `o.created_at` | R4 cargada fuera |
| extra: `<=` arriba | R4 `[desde, hasta)` |
| guardia T1: literal a mano | «no contiene ninguno de los valores como literal» |

g y h se midieron con un parche local, nunca commiteado, porque el cliente Prisma era anterior a
SLT-52. Repetirlas sin parche forma parte de T3 → T4.

### Tests

Medido por el leader tras `prisma generate`, sin parche: `ciclo-vida-gestion-final.int` 29/29, 0 saltados.
`prisma migrate status`: base local al día.

Medido por `backend_dev` antes de regenerar (pasados/fallados/saltados):
`ciclo-vida-resultados-de-cierre.guardia` 8/0/0, `ciclo-vida` 28/0/0, `cohorte-terminales.guardia` 8/0/0,
`cohorte-carga-ventana.int` 2/0/0, `cohorte-carga-reloj.int` 4/0/0, `sql-crudo-conteos` 4/0/0,
`censo-order-status-rename` 14/0/0.

`conteo-productos.int` y `dinero-productos.int` dan archivo `failed` con todo saltado también en
`origin/dev`, y están en el baseline: no es regresión.

### Aritmética de `sql-crudo-conteos`

O1 14 400 s + O4 19 800 s + O6 22 200 s = 56 400 s, n = 3 (antes 69 000).
No cuentan O2 y O3 (`novedad`), O5 (`reprogramado`), O7 (sin gestión) ni O8 (solo transición terminal).

### Desviaciones del spec

1. R6 y R8 no usan `454/_escenario`, porque esos tests están en el baseline: necesitan órdenes y zona
   central, y la base de CI solo trae catálogos. Siembran el cierre en el test y llaman a los métodos
   reales `resolverCierre` y `corregirResultadoGestionEnCierre`.
2. `condicionesDeCiclo`: cambió su comentario de cabecera, no su cuerpo.
3. Mutación g: `gestion_orden` no tiene `updated_at`; se usó el evento `gestion_corregida` de `orden_evento`.
4. Añadidos: aserción en la guardia de que el repositorio ya no nombra `ESTADOS_TERMINALES` ni
   `orden_historial_estado`; caso en `ciclo-vida.test.ts` sobre los resultados como parámetros.
