# SLT-77 — tope-intentos-por-empresa · requirements.md

> Zona: fullstack · Complejidad: high · depends_on: ninguna · Rama: feature/SLT-77-tope-intentos-por-empresa
>
> **Alcance:** el `maestro` de cada empresa fija, en una sección de la pantalla de Tarifas, cuántos
> intentos de entrega se hacen antes de pasar una orden a rechazo, de 1 a 10. Toda empresa arranca
> en 3, el valor de hoy. Cada punto que hoy lee el valor global usa el de la empresa de la orden,
> también los procesos que corren sobre varias empresas.
>
> **Lo que NO entra:** cambiar qué cuenta como intento (276 R31/R32). Mostrar el número al
> mensajero (276 R10). Rechazar o cobrar órdenes en el momento de guardar. Conservar por orden el
> tope con que nació. Pantalla nueva.
>
> Sembrado por `/afinar-feature` el 2026-11-06. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-06 | ¿Qué valores puede elegir una empresa? | De 1 a 10. El «mínimo de 3 por ley» de la feature 47 no limita a la empresa: decide y responde por su operación. |
| 2026-11-06 | ¿Quién lo cambia? | El `maestro` de la empresa. Otros roles no lo editan; lo que ve el `admin` sigue la regla de la pantalla (SLT-54 R55). |
| 2026-11-06 | ¿Qué pasa con las órdenes en curso? | Rige al guardar para todas las órdenes sin terminar. Guardar no rechaza ni cobra: una orden que ya alcanza el nuevo tope se resuelve en su siguiente paso normal, que incluye el proceso automático de `DevolucionSlaService`. Si sube, la orden gana intentos. |
| 2026-11-06 | ¿Dónde vive el ajuste? | Sección en `/configuracion/tarifas`. No es pantalla nueva. |
| 2026-11-06 | ¿Valor inicial? | 3 para toda empresa, también las existentes. Ninguna cambia sin decidirlo. |
| 2026-11-06 | ¿Depende de «Activar tarifas nuevas»? | No: rige al guardar, con o sin activación (SLT-54). |
| 2026-11-06 | ¿Criterio de conteo? | Sin cambios. Heredado de 276 R31/R32. |
| 2026-11-06 | ¿El número llega al navegador del mensajero? | No: solo el booleano ya decidido. Heredado de 276 R10. |
