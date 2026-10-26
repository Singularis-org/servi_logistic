# SL-18 «Únicos y secuencias por empresa» — requirements

> **Zona** backend · **Complejidad** high · **depends_on** SL-17 · **Rama** `feature/SL-18-unicos-secuencias-por-empresa`
>
> **Alcance.** Cierra lo que SL-17 dejó a esta ficha. `usuario.email` y `usuario.cedula` pasan a
> ser únicos por empresa, y login, OTP y recuperar contraseña aprenden a resolver la empresa. Entra
> también una guardia que impide un único de negocio nuevo sin `organizacion_id`, los índices
> compuestos de las rutas calientes y el registro push «el último gana» entre empresas.
> `num_guia` y su secuencia siguen globales, y queda escrito por qué.
>
> **Lo que NO entra.**
> - Las pantallas de entrada por empresa (`/e/<slug>/login` y su recuperar contraseña): SLT-41
>   «Entrada por empresa: login y recuperar contraseña», bloqueada por SL-18.
> - Landing pública por empresa: SL-35.
> - Partir `num_guia` o `orden_num_guia_seq` por empresa: decidido que no (ver Decisiones).
> - Los 18 únicos que SL-17 T3.9 ya hizo por empresa y los 52 anclados por FK: no se rehacen.
>
> Sembrado por `/afinar-feature` el 2026-10-26. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- **Superadmin y email repetido.** El superadmin no tiene empresa (SL-32). ¿Puede su email
  coincidir con el de un usuario de empresa? Si coincide, ¿`/login` lo trata como «email en
  varias»? Lo propone spec_author y se cierra en la aprobación del spec.
- **Cuentas sintéticas.** El email y la cédula sintéticos de las cuentas de integración (base
  `slug`, `db/schema.prisma` l.3170) y del usuario dedicado de API key: ¿siguen el mismo único por
  empresa, o hace falta un cambio en cómo se generan? spec_author lo verifica en el código.
- **Qué rutas son «calientes».** spec_author elige las rutas con evidencia (consultas reales,
  `EXPLAIN`), no por intuición.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-26 | ¿Dos empresas pueden tener el mismo número de guía? | No. `num_guia` sigue único global y `orden_num_guia_seq` sigue global, con `siguiente_num_guia()` y su permutación. La etiqueta, el QR, el rastreo `/paquete/[numGuia]` y la API por `numGuia` no cambian. SL-18 lo documenta en `docs/architecture.md`. |
| 2026-10-26 | ¿Una persona puede tener cuenta en dos empresas con el mismo email o cédula? | Sí. `usuario.email` y `usuario.cedula` pasan a ser únicos compuestos con `organizacion_id` primero, el patrón heredado de SL-17 T3.9. |
| 2026-10-26 | ¿Cómo entra a cada empresa alguien con el email repetido? | Por una entrada propia de cada empresa (`organizacion.slug`, SL-17 D13). SL-18 deja el backend listo (login, OTP y recuperar reciben la empresa). Las pantallas van a SLT-41. |
| 2026-10-26 | ¿Qué pasa con `/login`? | Sigue funcionando si el email existe en una sola empresa. Si existe en varias, no entra y pide usar la entrada de su empresa, sin decir en cuáles está. |
| 2026-10-26 | Recuperar contraseña con email repetido | Llega un correo con un enlace por cada empresa donde existe el email. Cada enlace cambia solo la cuenta de esa empresa. |
| 2026-10-26 | Push: un navegador pasa de una cuenta de A a una de B | El último gana. La suscripción queda solo con B (cierra la deuda D14 de `progress/deudas.md`). |
| 2026-10-26 | ¿Guardia de únicos? | Sí. Una guardia estática falla si una migración nueva crea un único de negocio sin `organizacion_id` (m6 de `progress/review_SL-17.md`). |
| 2026-10-26 | ¿Índices de rutas calientes? | Sí, los compuestos (`organizacion_id`, …) que SL-17 design §3 dejó a SL-18. |
| 2026-10-26 | Datos existentes | Sin backfill. Se hereda de SL-17 D9/D10 (app vacía). El `down.sql` aborta nombrando el índice si hay duplicados entre empresas (patrón SL-17 T3.9). |
| 2026-10-26 | ¿E2E? | Sí. Login es un flujo crítico (`docs/checkpoints-proyecto.md`): el E2E de `/login` sigue en verde y suma el caso «email en varias empresas». |
