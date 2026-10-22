# Fragmento para `.claude/agents/backend_dev.md`

> Pegar en la seccion de reglas del agente. Sin tildes, como el resto de `.claude/agents/`.

## Arquitectura hexagonal por modulos

El codigo vive en `lib/modules/<modulo>/` con `domain/`, `ports/` y `adapters/`
(`driven/` y `driving/`). La direccion de la dependencia es **hacia adentro** y no se
negocia. La tabla completa de que puede importar que esta en
`docs/architecture.md > La regla de dependencias`; leela antes de crear el primer archivo,
no despues de que la guardia se ponga roja.

Lo que mas se incumple sin querer:

- **`domain/` y `ports/` no importan framework ni base de datos.** Ni `next/*`, ni
  `react*`, ni `@prisma/client`, ni `@/lib/shared/**`. Si el dominio "necesita" la base,
  lo que necesita es un **puerto**, y la implementacion va en `adapters/driven/`.
- **De otro modulo se importa SOLO su contrato** (`@/lib/modules/<otro>`), nunca una ruta
  profunda. Si el contrato no expone lo que te hace falta, eso es una conversacion sobre el
  contrato, no un import profundo.
- **Un adaptador `driving` no instancia su adaptador `driven`.** Lo pide a
  `@/lib/composition`. Ese es el unico sitio donde un puerto se ata a su implementacion.
- **Modelo nuevo en `db/schema.prisma` = `/// @module <modulo>` encima.** Un modelo sin
  dueno es un hallazgo de la guardia, no un descuido tolerado.

Antes de dar una tanda por buena corre `pnpm exec vitest run guard`: la guardia de
arquitectura esta ahi y es mas rapida que descubrirlo en el gate.
