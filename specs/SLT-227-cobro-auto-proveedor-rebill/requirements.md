# SLT-227 — cobro-auto-proveedor-rebill · requirements.md

> Zona: backend · Complejidad: high · depends_on: SLT-226 (done) · Rama: feature/SLT-227-cobro-auto-proveedor-rebill
>
> **Alcance:** la interfaz `ProveedorCobro` (`crearEnlace`, `consultarPago`, `verificarFirma`, `devolver`)
> y un registro de proveedores (`rebill`, `wompi`, `global66`) que devuelve el adaptador por nombre.
> El adaptador de Rebill usa su API REST v3 (`x-api-key`), sin SDK. Las credenciales se guardan por
> proveedor, país y entorno, cifradas en la bóveda (`lib/crypto/boveda-integraciones.ts`), con un
> servicio que las guarda y las lee, sin pantalla. Un doble falso de Rebill sirve a los tests. Las
> llamadas llevan timeout, solo se reintenta lo idempotente y los errores de Rebill se traducen a
> errores del dominio. Docs: https://docs.rebill.com/api/reference/payment-links
>
> **Lo que NO entra:**
> - la pantalla de medios, proveedor y credenciales por país: SLT-251 «Cobro automático: medios y proveedor por país»;
> - el webhook: SLT-228 «Cobro automático: webhook por proveedor y el de Rebill»;
> - el enlace de pago por factura, es decir, quién llama a `crearEnlace`: SLT-230 «Cobro automático: enlace de pago por factura»;
> - el cobro en USD: SLT-229 «Cobro automático: cobro en USD para países sin cobertura»;
> - el adaptador de Wompi: SLT-252 «Cobro automático: adaptador de Wompi»;
> - el adaptador de Global66: SLT-253 «Cobro automático: transferencia y enlace con Global66»;
> - el botón «Pagar»: SLT-231 «Cobro automático: botón «Pagar» y estado de la factura».
>
> Sembrado por `/afinar-feature` el 2026-11-21. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-21 | ¿Quién guarda las credenciales? | SLT-227 crea la tabla cifrada (proveedor + país + entorno) y el servicio que guarda y lee, sin pantalla. La pantalla es de SLT-251. Mientras no exista, se cargan por siembra o script. |
| 2026-11-21 | ¿Sandbox o producción? | Lo decide el entorno de la app: local y preview usan siempre sandbox; producción usa producción. No hay interruptor por país. |
| 2026-11-21 | ¿De la plataforma o de la empresa? | De la plataforma, por proveedor y país (enmienda del humano del 2026-11-20). Si dos países comparten cuenta, se cargan las mismas credenciales en los dos (heredado de SLT-251). |
| 2026-11-21 | ¿País sin credenciales? | Error del dominio «sin configuración»; no se llama al proveedor (heredado de SLT-251: ese país paga por fuera). |
| 2026-11-21 | ¿Quién ve o cambia credenciales? | Solo el superadmin. El secreto descifrado nunca sale del servidor ni aparece en los logs. |
| 2026-11-21 | ¿SDK de Rebill? | No: REST con `fetch`; ninguna dependencia nueva (descripción de la ficha). |
| 2026-11-21 | ¿Tests contra Rebill real? | Nunca. Hay un doble falso, como el de Storage. |
| 2026-11-21 | ¿E2E? | Se difiere a SLT-231: esta ficha no tiene superficie en pantalla. Sus pruebas son de integración con el doble. |
| 2026-11-21 | Frontera con SLT-226 | `consultarPago` nació en SLT-226; esta ficha amplía la interfaz sin romper su contrato (design de SLT-226 §2). |
| 2026-11-21 | Ruta | Completa: dinero, integración externa y migración. |
| 2026-11-21 | Tamaño | Unos 25 archivos; cabe en un PR. |
