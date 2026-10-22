# La guardia de arquitectura

`guard-arquitectura-modulos.test.ts` — **13 bloques, 49 tests, 1597 líneas.** Copiado desde
la implementación de QC-15 el 2026-09-01, después de mergearse el PR #8.

Se copió al cerrar la feature y no antes, a propósito: una guardia que nadie ha visto
ponerse roja no es una guardia, es un archivo que da confianza sin dar cobertura. Ésta se vio
en rojo en cada regla, con la violación introducida a mano y revertida después.

## Qué comprueba

1. **Dirección de imports**, fila por fila de la tabla de
   `../../docs/architecture-hexagonal.md > La regla de dependencias`.
2. **Cruce de módulos**: todo import a otro módulo entra por su contrato
   (`@/lib/modules/<otro>`), nunca por ruta profunda.
3. **Frontera cliente/servidor**: ningún archivo con `'use client'` alcanza
   `@/lib/composition` ni `@/lib/shared/db/**`, ni transitivamente a través del contrato.
4. **Propiedad de modelos Prisma**: extrae los pares `(modelo, módulo)` de los comentarios
   `/// @module` de `db/schema.prisma`, busca `prisma.<modelo>` en los adaptadores *driven*, y
   falla si el módulo no es el propietario. Un modelo sin `/// @module` es hallazgo.
5. **La estructura vieja no vuelve**: `lib/services/`, `lib/repositories` y `lib/interfaces/`
   no existen.

## Léelo antes de reutilizarlo: costó tres rondas de revisión

El `reviewer` la **rechazó dos veces**, y las dos por el mismo defecto — el que hace que una
guardia pase siempre sin mirar nada:

- **Ronda 1.** Cinco bloques comparaban el especificador del import **como texto**, exigiendo
  el prefijo `@/`. Cualquier import **relativo** los atravesaba. Con tres violaciones reales
  metidas a la vez, daba 39/39 verde.
- **Ronda 2.** Quedaba una última comparación de cadena en la comprobación del contrato:
  `'./domain/../../../shared/routes'` reexportaba desde fuera del dominio y pasaba en verde.

De ahí salen las dos reglas de diseño que este archivo respeta y que **hay que mantener** si
lo tocas:

- **Todo destino se resuelve a una ruta real antes de aplicar la regla.** Nunca
  `spec.startsWith('@/…')`. Hay un único resolvedor; no dupliques la lógica.
- **Todo bloque que itera archivos afirma primero que barrió alguno**
  (`expect(allSourceFiles.length).toBeGreaterThan(0)`). Sin eso, un glob que deja de casar
  convierte el bloque en verde permanente. Es exactamente lo que le pasó a `SCANNED_DIRS` de
  `guard-password-never-plaintext` en este mismo repo.

Y una de diagnóstico: **un `it` por regla**. Varios `expect` en el mismo `it` hacen que el
primer fallo tape a los demás, y quien arregla el rojo suele ser un agente en otra sesión sin
contexto: dejarle media diagnosis cuesta una ronda entera.

## Al trasplantarlo

Está escrito contra las rutas de QuimiCloude. Revisa antes de reutilizarlo:

- Las constantes de rutas raíz (`lib/modules`, `lib/shared`, `lib/composition`, `app`,
  `components`, `hooks`) y el alias `@/`.
- `FORBIDDEN_LIB_DIRS` — es una **lista negra de nombres**, no una lista blanca. Un
  `lib/helpers/` nuevo pasa en verde; por eso `CHECKPOINTS.md` lleva el punto en forma
  positiva para el revisor humano.
- La lista de paquetes puros admitidos en `domain/` y `ports/` (hoy: sólo `zod`). Vive en una
  constante exportada para que ampliarla sea un cambio visible en el diff.

## Lo que esta guardia NO puede comprobar

Que la lógica de negocio esté en `domain/` y no en la Server Action. Un caso de uso que sólo
delega en el adaptador y devuelve pasa en verde y está mal. Eso lo mira una persona, y por eso
está escrito en `CHECKPOINTS.md`.
