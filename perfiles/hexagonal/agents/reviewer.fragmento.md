# Fragmento para `.claude/agents/reviewer.md`

> Pegar en la seccion de anti-patrones. Sin tildes, como el resto de `.claude/agents/`.

## Arquitectura hexagonal: que rechazas

Una regla que solo conoce el agente que la ejecuta no se hace cumplir. Estos son
**bloqueantes**, no comentarios:

- Un import desde `domain/` o `ports/` a framework, base de datos, `shared`, `composition`
  o adaptadores.
- Un import a otro modulo por ruta profunda en vez de por su contrato
  (`@/lib/modules/<otro>`).
- Un adaptador `driving` que instancia su propio `driven` en vez de pedirlo a
  `composition`.
- `lib/shared/**` importando un modulo. `shared` es hoja del grafo: si necesita un modulo,
  no era compartido.
- Un `'use server'` reexportado desde el barrel del modulo.
- Un modelo de Prisma sin `/// @module`, o un modulo consultando un modelo ajeno.
- `lib/services/`, `lib/repositories/` o `lib/interfaces/` de vuelta. Esa era la estructura
  anterior; volver a ella es exactamente lo que la guardia existe para impedir.

**La guardia no te exime de mirar.** Comprueba imports y propiedad de modelos; no comprueba
que el dominio sea *dominio*. Un caso de uso que solo llama al repositorio y devuelve, con la
regla de negocio escrita en la Server Action, pasa la guardia y esta mal.
