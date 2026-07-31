# BattleSide Ages

Mini-RTS auto-battler inspirado en **Age of Empires IV**. Elige tu civilización,
desarrolla tu economía, avanza de edad, compone tu ejército y destruye el castillo
rival. Todo en un único archivo, sin dependencias.

## Jugar

Abre `index.html` en el navegador, o juega online vía GitHub Pages:
**https://pilshub.github.io/battleside-ages/**

## Cómo se juega

- **Elige civilización** al inicio (8 disponibles), cada una con su unidad única y bonus.
- **Economía**: compra niveles de granja (comida), aserradero (madera) y mina (oro) para generar recursos.
- **Edades**: avanza Dark → Feudal → Castle → Imperial para desbloquear unidades y mejoras.
- **Entrena unidades** (botones o teclas **1–9**): lancero, jinete ligero, caballero, ballestero, mangonel, arcabucero, bombarda y la unidad única de tu civ.
- Las unidades **marchan y combaten solas**; tú gestionas la economía, las edades y la composición del ejército.
- **Herrería** (teclas **Q**/**W**): mejora la **Forja** (+12% de daño por nivel) y la **Armadura** (−9% de daño recibido por nivel) de todo tu ejército. Hay 3 niveles de cada una, desbloqueados por edad (Feudal → Castillo → Imperial), y compiten por el oro con el ejército y las edades.
- **Raideo**: la caballería que llega a la base enemiga mata sus aldeanos y reduce su ingreso.
- **Veteranía**: las tropas entrenadas en Edad del Castillo e Imperial salen más fuertes y lucen un **aura dorada** bajo la unidad.

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
| `F` | Avanzar de edad |
| `V` / `+` / `−` | Velocidad de partida x1/x2/x4 |
| `M` | Silenciar / activar sonido |

El **volumen** se ajusta con el deslizador del dock (junto a la velocidad).

## Características

- 9 tipos de unidad con contadores fieles a AoE.
- 8 civilizaciones con unidad única y bonus (Ingleses, Franceses, Mongoles, Sacro Imperio, Chinos, Otomanos, Rus, Delhi).
- **Herrería** al estilo AoE: mejoras de Forja y Armadura por edad que afectan al instante a todo tu ejército; la IA también las usa.
- Mecánica de **raideo** de economía.
- IA rival con economía propia, avance de edades y respuesta con contadores a tu composición.
- **Feedback de combate**: números de daño en naranja cuando golpeas con ventaja de contador, destello al recibir impactos y aura dorada de veteranía. Pasa el ratón por los botones de unidad para ver sus contadores.
- **Castillo progresivo**: el castillo gana vida al avanzar de edad y sus saetas hacen doble daño a las máquinas de asedio (contrajuego a la bombarda).
- Campo de batalla a pantalla completa con HUD integrado, sonido WebAudio sintetizado, **volumen ajustable** y velocidad x1/x2/x4.

## Desarrollo

Proyecto de un solo archivo (`index.html`): HTML + CSS + JS vanilla, canvas 2D,
sin librerías externas ni assets (todo el arte se dibuja por código).

---

*Fan-game sin ánimo de lucro inspirado en Age of Empires IV. No afiliado ni
respaldado por Microsoft. Age of Empires IV © Microsoft Corporation.*
