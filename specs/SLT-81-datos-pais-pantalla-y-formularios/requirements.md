# SLT-81 — datos-pais-pantalla-y-formularios · requirements.md

> **Zona:** fullstack · **Complejidad:** a evaluar por el leader · **depends_on:** SLT-42 · **Rama:** feature/SLT-81-datos-pais-pantalla-y-formularios
>
> **Alcance.** El superadmin carga y edita, para cada país, el prefijo telefónico, los dígitos
> nacionales, la zona horaria y los tipos de documento con su formato, en una sección «Datos del
> país» dentro de Plataforma › Geografía. Incluye el backend de escritura que SLT-42 no trae. El
> alta de un país pide esos datos. Los formularios de usuario, postulación pública, alta de empresa
> (maestro) y teléfonos de clientes muestran el prefijo y los tipos de documento del país de la empresa.
>
> **Lo que NO entra.** Reordenar la administración de países y zonas → SLT-46, que se adapta
> después. Moneda e impuestos → SL-21. Métodos de pago y SINPE → SL-22. Recalcular datos ya
> guardados al cambiar zona o formato. Normalizar teléfonos guardados (pregunta abierta de SLT-42).
>
> Sembrado por `/afinar-feature` el 2026-11-06. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)
_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas
- Postulación pública: cómo resuelve el formulario la empresa (y su país) antes de enviar, para
  mostrar prefijo y tipos. A confirmar en el código; si no hay forma, se decide con el humano.
- Lista de zonas IANA: de dónde sale (lista del runtime o una lista fija versionada), dado que la
  base no valida la zona (decisión de SLT-42). A decidir en el design, sin dependencias nuevas.

## Decisiones cerradas (no reabrir)
| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-06 | ¿Espera a SLT-46? | No. SLT-81 arranca ya; SLT-46 se adapta después. |
| 2026-11-06 | ¿Quién hace el backend de escritura? | SLT-81, que pasa de frontend a fullstack. |
| 2026-11-06 | ¿Dónde se editan los datos del país? | Sección «Datos del país» dentro de Plataforma › Geografía. |
| 2026-11-06 | ¿País nuevo sin datos? | El alta del país pide prefijo, dígitos, zona horaria y al menos un tipo de documento. |
| 2026-11-06 | ¿Cómo se elige la zona? | Selector con buscador que solo ofrece zonas IANA válidas. |
| 2026-11-06 | ¿Cambiar prefijo, dígitos o zona con empresas operando? | Se permite con confirmación que dice cuántas empresas afecta. Rige desde el cambio; lo guardado no se recalcula. |
| 2026-11-06 | Datos de Costa Rica | Ya los siembra SLT-42 (migraciones 20261106120000 y 120100). SLT-81 no los repite; un test comprueba que CR llega completo. |
| 2026-11-06 | ¿Cambio de formato de un tipo en uso? | Rige solo para lo nuevo: se exige al crear o editar ese documento; lo guardado no se revalida. |
| 2026-11-06 | ¿Qué formularios? | Alta y edición de usuario, postulación pública, alta de empresa (maestro), corregir datos del cliente y destinatarios de WhatsApp. |
| 2026-11-06 | ¿E2E? | Sí, uno: el superadmin crea un país con sus datos, da de alta una empresa de ese país y el formulario muestra su prefijo y sus tipos. |
| 2026-10-26 | ¿Quién escribe el catálogo? | Solo el superadmin; la empresa solo lee. Heredado de SL-17/SL-20 y SLT-42. |
| 2026-11-03 | ¿Se borran los tipos de documento? | No, se desactivan. Heredado de SLT-42 y spec 4. |
| 2026-11-03 | ¿Dónde se valida? | En el servidor, con el catálogo y la validación de SLT-42. |
