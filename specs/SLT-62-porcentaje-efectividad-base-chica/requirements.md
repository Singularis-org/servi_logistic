# SLT-62 «Mostrar el % de efectividad aunque haya pocas órdenes» — requirements

> Ficha `SLT-62`, rama `feature/SLT-62-porcentaje-efectividad-base-chica`, zona frontend,
> complejidad low. Spec escrito por `spec_author` el 2026-10-30.

## Alcance

**El problema.** En Analítica › «Detalle - Movimiento de las órdenes», la tarjeta héroe
«Efectividad de entrega» esconde el porcentaje cuando su base tiene menos de 20 órdenes (suelo
derivado de la tolerancia de 5 puntos por orden, ficha 441). En su lugar escribe «Entregado: N de M
órdenes» y «Son muy pocas para un porcentaje…», y la línea de abajo dice «…hacen falta 20 para que
este porcentaje no baile solo».

**Caso real** (`progress/verificacion-analitica-monitoreo-2026-10-29.md`, § 3): el recorte del
mensajero Jason Barrios tiene 12 órdenes, 11 en Entregado. La tarjeta héroe no da porcentaje, y la
sección «Detalle gestión», en la misma pantalla, da 91,7 %. El cliente lo leyó como un fallo.

**Lo que entra.**
- El porcentaje sobre las órdenes cargadas se escribe con cualquier tamaño de base, siempre que la
  cohorte tenga al menos una orden con desenlace.
- La línea del porcentaje sobre las órdenes con desenlace se escribe con cualquier tamaño de base,
  siempre que haya al menos una.
- Se quitan todos los textos de aviso de base pequeña.

**Lo que NO entra.**
- El estado «ninguna orden con desenlace» (`sin_cerradas`) y el estado «no entró ninguna orden»
  (`cargadas === 0`) siguen como están. Ver `## Preguntas abiertas`, P1.
- La barra de madurez, el rótulo, la base «de N órdenes cargadas» y el aviso de período en curso
  no cambian.
- `CohorteCargaTabla`, `CicloVidaKpi` y «Detalle gestión» no cambian: ninguno aplica el suelo de 20
  (comprobado en `design.md > Lo que ya existe`).
- La diferencia de universo entre Analítica y Monitoreo (12 frente a 24 órdenes) es de otra ficha.

## Decisiones cerradas (no reabrir)

| Fecha | Quién | Decisión | Cubierta por |
|---|---|---|---|
| 2026-10-30 | Carlos | El porcentaje se muestra SIEMPRE y LIMPIO, sin aviso de base pequeña. | R1, R2, R3, R4, R5, R6 |
| 2026-10-30 | Carlos | Se quita el texto «hacen falta 20» (y el resto de avisos de base chica). | R6 |
| 2026-10-30 | Carlos | Aplica a la cifra sobre cargadas y a la línea sobre las que tienen desenlace. | R1, R2, R4, R5 |

## Requisitos (EARS)

### La regla (cálculo, sin pantalla)

**R1.** SI la cohorte tiene al menos una orden cargada y al menos una orden con desenlace,
ENTONCES el sistema DEBE entregar el porcentaje sobre cargadas como `entregadas / cargadas`, sin
motivo de ausencia, cualquiera que sea el número de cargadas (también de 1 a 19).

**R2.** SI la cohorte tiene al menos una orden con desenlace, ENTONCES el sistema DEBE entregar el
porcentaje sobre las órdenes con desenlace como `entregadas / con desenlace`, sin motivo de
ausencia, cualquiera que sea el número de órdenes con desenlace (también de 1 a 19).

**R3.** El sistema DEBE dejar un porcentaje de efectividad de cohorte sin valor ÚNICAMENTE cuando
la cohorte no tiene ninguna orden con desenlace, y en ese caso el único motivo de ausencia DEBE ser
«sin cerradas». NO DEBE existir ningún otro motivo de ausencia (en particular, ninguno por tamaño
de base).

### La tarjeta héroe

**R4.** CUANDO la tarjeta héroe recibe una cohorte con menos de 20 órdenes cargadas y al menos una
con desenlace, la tarjeta DEBE pintar la cifra grande con el porcentaje sobre cargadas, el titular
«Entregado: <entregadas>» y el detalle «de las <cargadas> órdenes que entraron», igual que con una
base grande. Con 12 cargadas y 11 entregadas, la cifra DEBE ser «91,7 %».

**R5.** CUANDO la tarjeta héroe recibe una cohorte con entre 1 y 19 órdenes con desenlace, la
tarjeta DEBE pintar la línea «<porcentaje> de las <con desenlace> órdenes con desenlace terminaron
en Entregado», también cuando todas las cargadas tienen desenlace.

**R6.** La tarjeta héroe NO DEBE escribir ningún aviso de base pequeña con ningún tamaño de
cohorte: ni «hacen falta», ni «baile solo», ni «Son muy pocas para un porcentaje», ni «movería la
cifra», ni el titular sustituto «Entregado: <n> de <m> órdenes».

### Lo que no cambia

**R7.** MIENTRAS la cohorte tenga órdenes cargadas y ninguna con desenlace, la tarjeta héroe DEBE
seguir sin porcentaje y DEBE seguir escribiendo «Ninguna ha terminado todavía» y «<0> de <cargadas>
órdenes tienen desenlace…», sin línea de abajo.

**R8.** SI el recorte no tiene ninguna orden cargada, ENTONCES la tarjeta héroe DEBE seguir
escribiendo «No entró ninguna orden», sin porcentaje y sin barra de madurez.

## Mapa R -> test (para el implementer)

| R | Test |
|---|---|
| R1 | `tests/unit/analytics/madurez-cohorte.test.ts` › «R1 · base chica: el % sobre cargadas se escribe» (12/11, 1/1, 19/x) |
| R2 | `tests/unit/analytics/madurez-cohorte.test.ts` › «R2 · base chica: el % sobre las que tienen desenlace se escribe» (64/2/61 → 2/3; 8/6/0) |
| R3 | `tests/unit/analytics/madurez-cohorte.test.ts` › barrido exhaustivo de repartos con cargadas 0..25 |
| R4 | `tests/components/EfectividadHeroe.test.tsx` › «Jason Barrios: 11 de 12 pinta 91,7 %» |
| R5 | `tests/components/EfectividadHeroe.test.tsx` › «la línea de abajo se pinta con 3 y con 8 de 8 con desenlace» |
| R6 | `tests/unit/components/madurez-textos.test.ts` (barrido) + `tests/components/EfectividadHeroe.test.tsx` (queryByText nulos) |
| R7 | `tests/components/EfectividadHeroe.test.tsx` › «Zona Puntarenas…» (existente, se conserva) + `tests/unit/analytics/madurez-cohorte.test.ts` › «CERO CERRADAS…» (existente) |
| R8 | `tests/components/EfectividadHeroe.test.tsx` › «sin ninguna orden en el recorte lo dice con esas palabras» (existente, se conserva) |

## Preguntas abiertas

- **P1. ¿«SIEMPRE» incluye el caso de cero órdenes con desenlace?** La decisión del 2026-10-30
  habla de base pequeña. Hay otro caso en que la tarjeta no da porcentaje: hay órdenes cargadas
  pero ninguna tiene desenlace todavía (zona Puntarenas, 0 de 27). Ahí la cuenta sobre cargadas
  daría «0,0 %». La ficha 441 lo esconde a propósito: nadie ha fallado esas entregas, solo no han
  terminado. **Este spec lo deja como está (R7).** Si el humano quiere «0,0 %» también ahí, R7
  cambia y se añade un requisito; la línea sobre las que tienen desenlace seguiría sin poder
  calcularse (sería 0/0).
