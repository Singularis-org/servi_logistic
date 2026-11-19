# SLT-217 — ia-servicio-groq · requirements.md

> Zona: backend · Complejidad: medium · depends_on: — · Rama: feature/SLT-217-ia-servicio-groq
>
> **Alcance:** servicio interno de IA con Groq, solo del servidor y con clave de la plataforma
> (`GROQ_API_KEY`), para tareas internas del superadmin. Devuelve respuestas estructuradas
> validadas con esquema, enmascara datos personales antes de enviar, aplica un tope diario
> configurable y registra cada llamada en una tabla. Si Groq falla, no hay clave o se llegó
> al tope, quien lo usa sigue sin IA y queda registrado.
>
> **Lo que NO entra:** análisis de reportes de bugs (SLT-218), geografía, prefijo y UTC por
> IA (SLT-219), pantalla de consumo (sin ficha, futura), cambios al asistente de empresas de
> la ficha 436 (sigue con Anthropic).
>
> Sembrado por `/afinar-feature` el 2026-11-19. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no
> los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)
_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas
- Modelo de Groq por defecto: el spec propone uno vigente con su motivo; se aprueba con el spec.
- Retención de la tabla de registro (¿se purga tras N días?).
- Valor por defecto del tope diario.

## Decisiones cerradas (no reabrir)
| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-19 | Relación con el asistente de la ficha 436 | Groq aparte, solo uso interno del superadmin; el asistente de empresas sigue con Anthropic. |
| 2026-11-19 | Librería | Vercel AI SDK: `ai` + `@ai-sdk/groq`, dependencias nuevas con los 4 checks, fila en docs/dependencias.md y aprobación del humano en el design. |
| 2026-11-19 | Clave | `GROQ_API_KEY` en el entorno de la plataforma (.env.example); nunca llega al navegador. |
| 2026-11-19 | Modelo y timeout | Configurables por entorno (`GROQ_MODELO`, `GROQ_TIMEOUT_MS`), con default (heredado de 436: `ASISTENTE_MODELO`/`ASISTENTE_TIMEOUT_MS`). |
| 2026-11-19 | Forma de la respuesta | Estructurada, validada con zod; nunca texto libre sin validar. |
| 2026-11-19 | Diseño del adaptador | Interfaz + adaptador + probador para tests (heredado de 436: `IAsistenteProvider`). |
| 2026-11-19 | Tope | Tope diario de llamadas para toda la plataforma, configurable por entorno; al llegar, el uso sigue sin IA y queda registrado. |
| 2026-11-19 | Datos personales | El servicio enmascara correos, teléfonos y números de documento antes de enviar. |
| 2026-11-19 | Registro | Tabla en la base, una fila por llamada (uso, modelo, tokens, duración, resultado), sin datos personales ni secretos (heredado de SLT-59 R71). Sin pantalla. |
| 2026-11-19 | Fallo | Groq caído, sin clave o con tope alcanzado: no rompe ni bloquea a quien lo usa. |
| 2026-11-19 | Ruta | Completa: integración externa + migración. |
