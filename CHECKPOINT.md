# Checkpoint de animación — jugable

Estado guardado antes de cerrar el equipo. El goal sigue activo; esto no es el
cierre 10/10.

## Completado

- Una única instalación visual por recurso y bando.
- Cada compra económica asigna un aldeano; no crea otra mina/granja/etc.
- Pipeline 4×4 real: reposo, marcha, ataque y antorcha/asedio.
- Máscara de fondo conectada a bordes para componer las hojas generadas.
- Hojas activas: `lancer`, `archer`, `scout`, `crossbow`, `handcan`, `knight`,
  `elite`, `mangonel`, `bombard`, `saboteur`, `warden`, `longbow`, `royal`.
- Mangonel y bombarda usan estado `siege`, nunca antorcha.
- `npm test` y `npm run qa:browser` pasan; stress actual: 8,51 ms/tick.

## Pendiente al reanudar

- Generar hojas: `mangudai`, `landsknecht`, `zhugenu`, `janissary`,
  `horsearcher`, `warelephant` y `worker`.
- Añadirlas a `AVAILABLE_ANIMATED_TYPES` y activar `WORKER_SHEET`.
- Ampliar tests de identidad/filas/fotogramas y ejecutar el gauntlet completo.
- Auditar capturas desktop/móvil, optimizar carga/render, soak, balance y publicar
  el cierre solo si no quedan P0/P1.
