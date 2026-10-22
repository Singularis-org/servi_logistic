# Fragmento para `.claude/agents/frontend_dev.md`

> Pegar en la seccion de reglas del agente. Sin tildes, como el resto de `.claude/agents/`.

## Arquitectura hexagonal: que puedes importar desde la UI

`components/`, `hooks/` y `app/` **no** se modularizan: siguen donde estan y la convencion
de componentes de ruta en `<ruta>/components/` con barrel sigue vigente igual. Lo que si
cambia es de donde sale lo que consumes:

- **Tipos, constantes y validaciones** de un modulo: de su contrato, `@/lib/modules/<modulo>`.
  Nunca de `.../domain/algo` por ruta profunda.
- **Server Actions**: por su ruta exacta,
  `@/lib/modules/<modulo>/adapters/driving/<accion>`. **No hay barrel sobre archivos
  `'use server'`** a proposito: un barrel arrastraria servidor al cliente.
- **Nunca** `@/lib/composition` ni `@/lib/shared/db/**` desde un archivo con `'use client'`.
  Eso mete la instancia de Prisma en el bundle del navegador.

Si un componente de cliente empieza a necesitar `composition`, la respuesta no es importarlo:
es que ese trabajo pertenece al servidor y sube a la Server Action o al Server Component.
