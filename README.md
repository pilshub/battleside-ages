# BattleSide Ages

Mini-RTS pixel-art inspirado en **Age of Empires IV**. Elige tu civilización,
desarrolla tu economía, disputa el segundo frente de **El Prado**, avanza de edad,
compone tu ejército y destruye el castillo rival. HTML/CSS/JS vanilla y sin
dependencias de ejecución.

## Jugar

Abre `index.html` en el navegador, o juega online vía GitHub Pages:
**https://pilshub.github.io/battleside-ages/**

## Cómo se juega

- **Elige civilización** al inicio (8 disponibles), cada una con su unidad única y bonus.
- **Economía**: compra niveles de granja (comida), aserradero (madera), mina (oro) y cantera (piedra) para generar recursos.
- **El Prado**: un segundo frente económico visible. Construye hasta 3 **Almacenes** (+6% de producción cada uno), 2 **Puestos de Vigía** y 1 **Campamento de Incursión**.
- **Incursiones dirigidas**: marca Granja, Madera, Oro o Piedra y envía **Saboteadores** (`R`) contra ese recurso. Despliega **Guardianes** (`Y`) para patrullar e interceptarlos; `H` cambia el objetivo.
- **Edades**: avanza Dark → Feudal → Castle → Imperial para desbloquear unidades y mejoras.
- **Entrena unidades** (botones o teclas **1–9**): lancero, jinete ligero, caballero, ballestero, mangonel, arcabucero, bombarda y la unidad única de tu civ.
- Las unidades **marchan, trabajan, patrullan y combaten con animación visible**. Infantería y caballería atacan edificios con antorchas; mangoneles y bombardas conservan sus proyectiles de asedio.
- **Defensa** (teclas **B**/**N**): levanta la **Muralla** delante de tu castillo (hasta 3 niveles, bloquea el asalto hasta derribarla) y hasta **2 torres** que acribillan al asedio. Todo se paga con piedra; la IA también fortifica.
- **Herrería** (teclas **Q**/**W**): mejora la **Forja** (+12% de daño por nivel) y la **Armadura** (−9% de daño recibido por nivel) de todo tu ejército. Hay 3 niveles de cada una, desbloqueados por edad (Feudal → Castillo → Imperial), y compiten por el oro con el ejército y las edades.
- **Tecnología única** (tecla **T**): cada civilización investiga un estudio insigne (edad 2 o 3) que refuerza su doctrina: arcos ingleses, corazas francesas, velocidad mongola, cruzada del Imperio, pólvora china, artillería otomana, fortaleza rusa o elefantes sagrados de Delhi. Una sola vez por partida; la IA también la investiga.
- **Raideo**: la caballería que llega a la base enemiga mata sus aldeanos y reduce su ingreso.
- **Cantera**: cuarto motor de economía; la piedra paga la defensa (muralla y torres).
- **Veteranía**: las tropas entrenadas en Edad del Castillo e Imperial salen más fuertes y lucen un **aura dorada** bajo la unidad.
- **Dificultad**: Fácil, Normal, Difícil y Extremo (ajustable con los botones de la pantalla de selección). La IA escala su economía, cadencia de entrenamiento, tamaño de ejército y avance de edades.
- **Música y Codex**: música ambiente medieval procedural (WebAudio, se intensifica con las edades) y el **Codex** (`C` o el botón "El Codex") con la guía completa: unidades con costes y contadores, tecnologías y herrería, las 8 civilizaciones y la tabla de contadores.
- **Pausa**: el botón **Pausa** del área de ritmo o la tecla **P** detiene la simulación; **Continuar** (o `P`) la reanuda. `Esc` reanuda únicamente una pausa abierta.
- **Preferencias**: dificultad, velocidad, silencio y volumen se guardan de forma segura en `localStorage` (clave versionada) y se restauran al volver a jugar.
- **Responsive**: la selección y el dock se adaptan a pantallas estrechas y bajas; el reclutamiento puede desplazarse horizontalmente con tacto.

### Contadores (piedra-papel-tijera AoE)

- **Lancero** > caballería (jinete/caballero)
- **Caballería** > arqueros y economía (raideo)
- **Ballestero / Arcabucero** > unidades pesadas
- **Mangonel** > grupos de infantería
- **Bombarda** > castillos y edificios
- **Caballería** > máquinas de asedio

### Controles

| Tecla | Acción |
|---|---|
| `1`–`9` | Entrenar unidad |
| `Q` / `W` | Mejorar Forja (ataque) / Armadura |
| `T` | Investigar la tecnología única de tu civilización |
| `B` / `N` | Construir Muralla / Torre |
| `R` / `Y` | Enviar Saboteador / desplegar Guardián en El Prado |
| `H` | Cambiar el recurso objetivo de la próxima incursión |
| `F` | Avanzar de edad |
| `U` | Construir la Maravilla |
| `G` | Cambiar formación |
| `P` | Pausar / reanudar |
| `V` / `+` / `−` | Velocidad de partida x1/x2/x4 |
| `M` | Silenciar / activar sonido |
| `C` | Abrir / cerrar el Codex (también `Esc`) |

El **volumen** se ajusta con el deslizador del dock (junto a la velocidad).

## Características

- 9 unidades militares base, 8 unidades únicas y 2 especialistas de El Prado.
- 8 civilizaciones con unidad única y bonus (Ingleses, Franceses, Mongoles, Sacro Imperio, Chinos, Otomanos, Rus, Delhi).
- **Herrería** al estilo AoE: mejoras de Forja y Armadura por edad que afectan al instante a todo tu ejército; la IA también las usa.
- **Tecnología única por civilización**: 8 estudios insigne (edad 2/3) que potencian la doctrina de cada casa; la IA los investiga en cuanto puede.
- Mecánica de **raideo** de economía.
- **Segundo frente de El Prado** con construcción, objetivos de incursión explícitos, Saboteadores, Guardianes y defensa automática de vigías; la IA usa las mismas reglas.
- **Ataque a edificios contextual**: antorchas para tropas y proyectiles propios para máquinas de asedio.
- IA rival con economía propia, avance de edades y respuesta con contadores a tu composición.
- **Feedback de combate**: números de daño en naranja cuando golpeas con ventaja de contador, destello al recibir impactos y aura dorada de veteranía. Pasa el ratón por los botones de unidad para ver sus contadores.
- **Castillo progresivo**: el castillo gana vida al avanzar de edad y sus saetas hacen doble daño a las máquinas de asedio (contrajuego a la bombarda).
- **Defensa construible**: muralla (3 niveles, bloquea el asalto) y torres de vigilancia que disparan a los sitiadores; se erigen con piedra y la IA fortifica igual.
- Campo de batalla a pantalla completa con HUD integrado, sonido WebAudio sintetizado, **volumen ajustable** y velocidad x1/x2/x4.
- **Música ambiente procedural**: dron modal + percusión de tímbal + arpegio de laúd, todo sintetizado en WebAudio (sin archivos). Se intensifica según la edad media de ambos bandos.
- **Codex del Valle**: overlay con 4 pestañas (Unidades, Tecnologías, Civilizaciones, Contadores) generadas desde los datos reales del juego.

## Desarrollo

Proyecto de un solo archivo (`index.html`): HTML + CSS + JS vanilla, canvas 2D y sin dependencias de ejecución.

### Arte

El arte pixel-art original fue generado con ChatGPT/ImageGen para este proyecto:

- `assets/battle-ages-key-art.webp` — ilustración de fondo a sangre completa para la selección y la pantalla final.
- `assets/battle-ages-emblem.webp` — emblema mostrado en ambas pantallas.
- `assets/pixel-valley-background-v1.png` — placa de juego vacía, sin tropas ni edificios impresos.
- `assets/pixel-units-atlas-v1.png` — atlas 5×4 de tropas, especialistas y aldeano.
- `assets/pixel-buildings-atlas-v1.png` — atlas 4×4 de economía, Prado, defensa, castillos y maravilla.
- `assets/pixel-meadow-atlas-v1.png` — atlas 4×4 de recursos, fuego, humo, impactos y marcadores.

El canvas usa escalado sin suavizado y conserva rutinas vectoriales como fallback si algún atlas no carga.

### Pruebas

```sh
npm install   # instala jsdom (solo para el test de DOM)
npm test                 # smoke y checks headless + verificación DOM (jsdom)
npm run qa:browser      # QA en Chrome real (desktop y móvil vía CDP)
npm run qa:soak         # estabilidad prolongada determinista (seed 1337)
npm run qa:balance      # diffcheck: 20 partidas/dificultad con seeds 1337 y 4242
```

- `tools/bsa-harness.js` — arnés headless con `smoke`, `diffcheck [N] [seed]`, `soakcheck [seed]`, `autoplay [pCiv eCiv]`, `formcheck`, `defcheck`, `techcheck`, `wondercheck` y `pradocheck`. `diffcheck` ejecuta N partidas por dificultad con calendario y azar de simulación desacoplados. `pradocheck` verifica producción, caps, incursión, defensa y la excepción de asedio.
- `tools/browser-qa.js` — QA de Chrome real en 1440×900 y 500×844: assets, escenas pixel-art, interacción, overflow, errores de consola/red y stress de 84 tropas. Guarda capturas en `artifacts/`.
- `tools/dom-test.js` — jsdom con eventos reales: accesibilidad, Codex, pausa, partida completa, construcción/objetivos/unidades de El Prado, estados animados y antorcha frente a proyectil de asedio.

### Gauntlet final

- 160 partidas reproducibles (`N20`, seeds `1337` y `4242`), sin excepciones, empates ni partidas incompletas.
- Tasa agregada del bot jugador: **Fácil 100% · Normal 52,5% · Difícil 32,5% · Extremo 0%**.
- Stress de Chrome: 84 tropas, 300 ticks, ~0,8 ms/tick (presupuesto: 16,7 ms/tick).
- Soak determinista: 8+ partidas y más de 100.000 pasos, con invariantes de recursos, colas, caps de ambos frentes, proyectiles y estado finito.

---

*Fan-game sin ánimo de lucro inspirado en Age of Empires IV. No afiliado ni
respaldado por Microsoft. Age of Empires IV © Microsoft Corporation.*
