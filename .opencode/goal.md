# Objetivo del repo: BattleSide Ages → 10/10

Llevar el juego (un solo `index.html`, mini-RTS auto-battler inspirado en AoE2/AoE4) a un 10/10 ejecutando el roadmap ultra-ambicioso **en orden**:

1. **Tier 1-D · Sonido y lore**: música ambiente + SFX (WebAudio, sin dependencias), Codex de unidades/tecnologías.
2. **Tier 2 · Profundidad AoE**: recurso Piedra, murallas construibles/dañables, torres de defensa, formaciones (línea/horda/flanco), tecnologías únicas por civilización, maravilla (condición alternativa de victoria).
3. **Tier 3 · Profundidad AoE IV**: árbol de eras de 4 niveles, tesoros/neutrales en el mapa, entrenamiento manual, civilizaciones con estilos distintivos.
4. **Tier 4 · Campaña**: misiones narrativas, meta-progresión, logros, balanceo fino competitivo.

## Reglas de ejecución

- No romper lo existente: Herrería AoE (Q/W), dificultad Fácil/Normal/Difícil/Extremo, IA mejorada, game over enriquecido, volumen, despliegue GitHub Pages.
- Mantener el juego en un único `index.html` sin dependencias de runtime externas.
- Conservar la API headless del arnés `bsa-harness.js` (smoke, diffcheck, 0 excepciones).
- Verificar siempre con el arnés + auditoría antes de commitear.
- Un commit por fase, mensajes en español.
- Desplegar en https://pilshub.github.io/battleside-ages/.
