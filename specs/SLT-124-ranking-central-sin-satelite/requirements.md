# SLT-124 «Ranking de la central sin mensajeros de satélite» — requirements

> Ruta **completa** (Carlos, 2026-11-11): `requirements.md` + `design.md` + `tasks.md`. Escrito por
> spec_author el 2026-11-11. El cómo técnico está en `design.md`; el desglose, los archivos
> esperados y el mapa de tests, en `tasks.md`.

## Alcance

**El hueco del premio.** Al listar el podio y al registrar un premio, el sistema busca «el cierre del
mensajero que agrupa el trabajo de ese día» sin mirar el destino del cierre
(`lib/services/PremioRankingDevengoService.ts:149-152` y `:186-189`;
`lib/repositories/CierreDelDiaRepository.ts:40-52`). Así, la central puede colgar un premio (con su
egreso de caja) de un cierre de **satélite**, que desde SLT-122 «Pago al mensajero: solo la bodega
dueña del cierre» nadie puede pagar en el sistema. En el **caso mixto** (cierre de satélite y cierre
central el mismo día), gana el que se pidió antes, aunque sea el de satélite. Es la fila 5 de
`progress/investigacion_SLT-122.md:150`.

**El mismo defecto en los incentivos (SLT-68).** El incentivo se cuelga del cierre aprobado más
reciente sin mirar el destino (`lib/services/IncentivoMensajeroService.ts:62` y `:80`). Es la fila 4
de la investigación y el menor m2 de `progress/review_SLT-122.md:113-121`.

**El cálculo del ranking también los incluye.** El ranking en vivo y el congelado diario parten de
todos los mensajeros activos de la empresa, sin zona (`lib/repositories/UserRepository.ts:324-341`,
usado solo por `RankingService.ts:102` y `RankingSnapshotService.ts:113`), y cuentan entregas y
asignadas sin zona ni destino (`lib/repositories/RankingRepository.ts:47-97`). Un mensajero de
satélite puede hoy ocupar el podio de la central.

**Quién es «de la central».**
- Un **cierre** es de la central si su destino persistido es `bodega_central`; se deriva al pedirlo
  con la zona del mensajero (`lib/services/CierreDiaService.ts:703-715`,
  `lib/utils/bodega-responsable.ts:16-23`).
- Un **mensajero** es de la central si su zona actual es la zona marcada como central de la
  empresa (`zona.es_central`). Es la misma regla con la que nacen sus cierres.

**Lo que entra.**
1. Premio del podio: solo se resuelve contra cierres de la central, al listar y al registrar.
2. Incentivo: solo se imputa a cierres aprobados de la central.
3. El ranking de la central, en vivo y congelado, solo con mensajeros de la central.

**Lo que NO entra.**
- Corregir premios o incentivos ya registrados: T0 midió 0 (D5).
- Anular un premio o un incentivo: no cambia (R7, R11).
- Reescribir snapshots ya congelados (R13).
- Cambiar textos de la UI: se reusan los estados y el estado vacío que ya existen.
- Un ranking propio de la satélite.
- Esquema y migraciones.

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién, cuándo | Cubierta por |
|---|---|---|---|
| D1 | Nadie registra en el sistema el pago de un cierre de satélite, **sin excepción de premios ni incentivos**: el ranking de la satélite es otro y no se combina con el de la central. | Carlos, 2026-11-10 (`specs/SLT-122-pago-bodega-duena/requirements.md:254`) | R1, R2, R3, R8, R9, R10, R12 |
| D2 | La central no asigna premios a cierres de satélite (descripción de la ficha). | Carlos, board, 2026-11-10 | R1, R2, R3, R4, R5 |
| D3 | Ruta completa (PA0). | Carlos, 2026-11-11 | — (proceso) |
| D4 | PA1 = B: los mensajeros de satélite salen del cálculo del ranking de la central, en vivo y congelado, además del premio y el incentivo. La empresa sin zona central marcada va como requisito explícito. | Carlos, 2026-11-11 | R12, R13, R14 |
| D5 | PA3: medido en prod el 2026-11-11 (`READ ONLY`): 0 premios y 0 incentivos colgados de cierres de satélite, 0 filas de podio con premio de mensajeros que no son de la central, 0 mensajeros y 0 días mixtos. No hay nada que anular ni migrar. | Carlos / leader, 2026-11-11 | — (T0 hecho) |
| D6 | PA2 (textos) no aplica con B: se quita. | Carlos, 2026-11-11 | — |

## Requisitos (EARS)

**Premio del podio (293)**

**R1** — CUANDO un actor con acceso total (`maestro` o `admin`) registra el premio de una fila del
podio, el sistema DEBE imputarlo solo a un cierre con destino `bodega_central` de ese mensajero que
agrupe gestiones vigentes de ese día. Un cierre con destino `bodega_satelite` NO DEBE ser elegido,
en ningún estado.

**R2** — SI ese día el mensajero solo tiene cierres con destino `bodega_satelite` (en cualquier
estado), ENTONCES registrar el premio DEBE responder `sin_cierre` sin escribir el devengo en el
libro del mensajero, el egreso en la caja ni la acción `premio_ranking_registrado` sobre la fila.

**R3** — SI ese día el mensajero tiene un cierre de satélite y otro central, ENTONCES el sistema
DEBE resolver el central aunque el de satélite tenga un `solicitado_at` anterior:
- si el central está `aprobado`, el premio se imputa a él;
- si no, la respuesta es `cierre_no_aprobado` con el estado **del central**, aunque el de satélite
  esté `aprobado`.

**R4** — CUANDO un actor con acceso total lista los premios de una fecha, el estado de cada fila con
premio y sin registro DEBE derivarse con la misma resolución de R1-R3: `sin_cierre` si solo hay
cierres de satélite y, en el caso mixto, el estado del central.

**R5** — El sistema DEBE aplicar el filtro de R1-R4 en la consulta a la base que resuelve el cierre
del día, y no como un filtro en memoria después de leerlo.

**R6** — CUANDO el mensajero tiene ese día solo cierres `bodega_central`, el registro y el listado
DEBEN comportarse exactamente como antes de esta ficha:
- se elige el mismo cierre (desempate por `solicitado_at` y por `id`);
- las respuestas son las mismas: `ok`, `ya_registrado`, `anulado`, `sin_cierre` y
  `cierre_no_aprobado`.

**R7** — CUANDO un actor con acceso total anula un premio ya registrado contra un cierre de
satélite, el sistema DEBE anularlo como hoy: compensación contra ese mismo cierre y reverso del
egreso de caja.

**Incentivo manual (SLT-68)**

**R8** — CUANDO un actor con acceso total registra un incentivo a un mensajero, el sistema DEBE
imputarlo al cierre `aprobado` más reciente **con destino `bodega_central`** de ese mensajero, aunque
haya un cierre `aprobado` de satélite más reciente.

**R9** — SI el mensajero no tiene ningún cierre `aprobado` con destino `bodega_central` (aunque los
tenga aprobados de satélite), ENTONCES registrar el incentivo DEBE responder `sin_cierre_aprobado`
sin escribir el egreso de caja ni el devengo.

**R10** — SI, bajo el candado, el sistema relee el cierre elegido y no lo encuentra `aprobado` con
destino `bodega_central`, ENTONCES DEBE responder `sin_cierre_aprobado` sin escribir nada. Tanto la
elección de R8 como esta relectura filtran el destino en la consulta a la base.

**R11** — CUANDO un actor con acceso total anula un incentivo ya registrado contra un cierre de
satélite, el sistema DEBE anularlo como hoy (reverso en el libro y en la caja).

**Cálculo del ranking**

**R12** — El ranking en vivo y el congelado diario DEBEN construirse solo con los mensajeros activos
cuya zona actual es la zona `es_central` de la empresa. Un mensajero con zona de satélite, o sin
zona:
- NO DEBE aparecer en la lista;
- NO DEBE ocupar ninguna posición de podio;
- NO DEBE desplazar a nadie: el podio lo ocupan los mensajeros de la central, por el mismo orden y
  con el mismo umbral que hoy.

**R13** — El sistema NO DEBE reescribir ningún snapshot ya congelado. El histórico y el listado de
premios de fechas anteriores se leen igual que antes de esta ficha.

**R14** — SI la empresa no tiene ninguna zona marcada `es_central`, ENTONCES:
- el ranking en vivo DEBE responder sin filas, y la pantalla muestra el estado vacío que ya existe
  («Todavía no hay mensajeros para mostrar hoy.», `app/(app)/ranking/_components/ranking-labels.ts:107`);
- el congelado diario DEBE escribir la cabecera del día con 0 filas, igual que un día sin actividad
  (`RankingSnapshotService.ts:150-156`);
- el listado de premios de esa fecha DEBE responder que hay ranking congelado pero sin podio.

Es coherente con que todos los cierres de esa empresa nacen con destino `bodega_satelite`
(`CierreDiaService.ts:709-715`). **[Preview]** El código no dice qué hacer en este caso. Esto es lo
mínimo (no hay aviso nuevo ni texto nuevo) y se enseña a Carlos en Preview.

## Preguntas abiertas

Ninguna. PA0-PA3 están cerradas en D3-D6.
