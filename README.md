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
- **Raideo**: la caballería que llega a la base enemiga mata sus aldeanos y reduce su ingreso.

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
| `V` / `+` / `−` | Velocidad de partida x1/x2/x4 |
| `M` | Silenciar / activar sonido |

## Características

- 9 tipos de unidad con contadores fieles a AoE.
- 8 civilizaciones con unidad única y bonus (Ingleses, Franceses, Mongoles, Sacro Imperio, Chinos, Otomanos, Rus, Delhi).
- Mecánica de **raideo** de economía.
- IA rival con economía propia, avance de edades y respuesta con contadores a tu composición.
- Campo de batalla a pantalla completa con HUD integrado, sonido WebAudio sintetizado y velocidad ajustable.

## Desarrollo

Proyecto de un solo archivo (`index.html`): HTML + CSS + JS vanilla, canvas 2D,
sin librerías externas ni assets (todo el arte se dibuja por código).

---

*Fan-game sin ánimo de lucro inspirado en Age of Empires IV. No afiliado ni
respaldado por Microsoft. Age of Empires IV © Microsoft Corporation.*
