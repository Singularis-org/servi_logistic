// CONTRATO PUBLICO del modulo. Renombra la carpeta a lib/modules/<modulo>/.
//
// Regla: aqui SOLO se reexporta de ./domain. Nada de 'use server', nada de Prisma, nada de
// next/*. Este archivo tiene que poder importarse desde un componente de cliente sin
// arrastrar codigo de servidor al bundle.
//
// Lo que NO va aqui, a proposito:
//   - Los adaptadores driving ('use server'): se importan por su ruta exacta.
//   - Los puertos: son la superficie hacia adentro, solo para adapters/ y composition/.

export {};
