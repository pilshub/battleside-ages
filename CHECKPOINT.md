# Checkpoint final del gauntlet — publicable

Estado final verificado antes de publicar.

## Completado

- Una única instalación visual por recurso y bando.
- Cada compra económica asigna un aldeano; no crea otra mina/granja/etc.
- Pipeline 4×4 real: reposo, marcha, ataque y antorcha/asedio.
- Máscara de fondo conectada a bordes para componer las hojas generadas.
- Hojas individuales activas para las 19 unidades y el aldeano; 16 frames por
  hoja, sin fondos visibles y con caché de render a resolución reducida.
- Mangonel y bombarda usan estado `siege`, nunca antorcha.
- `npm test`, `npm run qa:browser`, `npm run qa:soak` y `npm run qa:balance`
  pasan; stress actual: 0,805 ms/tick con 84 unidades.

## Evidencia de cierre

- 160 partidas de balance, cero excepciones/empates/incompletas; curva agregada
  100% / 52,5% / 32,5% / 0% para Fácil / Normal / Difícil / Extremo.
- Soak de 10 partidas, 114.407 pasos y 5.720,3 segundos simulados.
- Capturas auditadas: desktop, móvil y revista de las 19 unidades.
- Cero fallos de red, excepciones JavaScript o errores de consola.
- No quedan hallazgos P0/P1 abiertos.
