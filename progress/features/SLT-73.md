# SLT-73 «El dinero de la satélite entra a la wallet de la central solo al conciliar»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-73 | dinero-satelite-al-conciliar | fullstack | high | hotfix/SLT-73-dinero-satelite-al-conciliar | Carlos Restrepo | spec |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.2: spec en `specs/SLT-73-dinero-satelite-al-conciliar/`. HOTFIX: rama desde `origin/prod`
(96f94987), worktree `.worktrees/SLT-73-hotfix`.

## Evaluación
fullstack (wallet al aprobar `cierre_dia` satélite en `CierresAdminRepository.resolverCierre`,
conciliación en `ConciliacionSatelitesService`, saldo en `SaldosSatelitesRepository`, pantalla
`/wallet/satelites`), high: dinero, migración de datos. Reabre una decisión de la ficha 431
(«consolidar/conciliar no mueve dinero»): la reabre Carlos el 2026-10-31.

## Decisiones
- 2026-10-31 (Carlos): HOTFIX urgente.
- 2026-10-31 (Carlos): **todo** lo de un cierre del día satélite espera a la conciliación para entrar
  a la wallet de la central (COD, flete, comisión, IVA, pago al mensajero… nada entra al aprobar).
- 2026-10-31 (Carlos): la deuda de la satélite con la central suma **todos los métodos de pago**
  (efectivo, SINPE, transferencia). El SINPE de la satélite (ficha 429) es solo el medio por el que
  ella recibe; sigue siendo deuda. **Se descuentan** las ganancias de la satélite y lo que ella paga
  a sus mensajeros. La conciliación debe mostrar lo que le pertenece a la satélite.
- 2026-10-31 (Carlos): si se recibe menos de lo esperado, entra lo recibido y la diferencia queda
  como deuda abierta.
- 2026-10-31 (Carlos): revertir lo ya registrado en la wallet por cierres satélite sin conciliar,
  para que sume al conciliar.
- 2026-10-31 (Carlos): la ganancia de la satélite es el dato que ya existe → `cierre_dia.total_ingreso_bodega_rechazos`
  (56; `paraLaCentral`, lib/utils/ingreso-empresa.ts:681).
- 2026-10-31 (Carlos): el saldo de la tienda también espera a la conciliación; ídem el resto de la
  transacción salvo lo que no es dinero (libro del mensajero incluido).

## Evidencia (prod, solo lectura, 2026-10-31; sin datos personales)
- 1 cierre del día satélite aprobado (zona satélite GAM-Alajuela), ₡76.890 todo SINPE, ₡0 efectivo.
  0 cierres de bodega, 0 conciliaciones. La wallet ya tiene 6 movimientos de ese cierre
  (COD 76.890, flete 7.800, IVA flete 1.014, comisión COD 2.691,15, IVA comisión 349,85,
  egreso pago mensajero 6.000). `/wallet/satelites` la muestra al día.
- Causas: el pendiente es Σ(`total_efectivo` − `monto_recibido`) de consolidaciones; no cuenta
  cierres aprobados sin consolidar ni el SINPE.

## T9 (prod, solo lectura, 2026-10-31)
- Conjunto S = 1 cierre. Caja 6 filas (₡94.745). Tienda: 2 créditos (₡76.890, 2 tiendas), 8 débitos
  (₡11.855). Mensajero 1 fila (₡6.000). `liquidacion_pago` de S = 0 → la migración no aborta.
- Sin pagos posteriores a esas tiendas; sus saldos siguen positivos tras retirar ~₡65 mil netos.

## Preguntas abiertas
Q1 y Q2 cerradas por Carlos el 2026-10-31 (D10 = opción A, D11 = bloquear revertir). Spec APROBADO por Carlos el 2026-10-31.
- 2026-10-31 (Carlos), D12: la diferencia de la satélite NO resta de la ganancia ni de «De las tiendas»:
  va a un bolsillo nuevo de la caja «Por cobrar a satélites». Motivo: con `terceros` la guardia
  `caja-clasificacion-459` (R8: «De las tiendas» = Σ saldos de tiendas) queda roja. Enmienda al spec.
- 2026-10-31 (Carlos): D12 aprobada; D13 tercer tramo en la barra; D14 bloque siempre visible.
- 2026-10-31 (Carlos), D15: los premios/incentivos del mensajero colgados del cierre satélite
  (`premio_ranking`, `incentivo`, `premio_dia`) también se retiran en T8 y deben volver al conciliar.
  → REVOCADA el mismo día: al saber que los registra una persona después (no la aprobación), Carlos:
  «entonces no hay que hacer nada con ellos». Se quedan como hoy; T8 no los retira.
- 2026-10-31 (Carlos), D16: dentro del hotfix, alinear con la deuda nueva el estado de cuenta de la
  bodega (458, «Pendiente de llegar») y la tarjeta «Conciliación» de /cierres-admin (nota
  «Desmarcar no mueve dinero» ya falsa).
- 2026-10-31 (Carlos): autoriza resetear la base LOCAL `servi_slt73` para repetir el gate.

## Tandas

## Modelos (overrides)

## Cierre
