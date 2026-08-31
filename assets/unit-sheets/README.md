# Hojas de animación

Cada PNG corresponde a una unidad y usa una cuadrícula 4×4:

1. reposo;
2. marcha;
3. ataque contra unidades;
4. antorcha contra edificios, o disparo/recarga en máquinas de asedio.

Hay una hoja distinta para cada uno de los 19 tipos militares del juego. La
hoja `worker-v1.png` reserva la tercera fila para agricultura y la cuarta para
hacha/pico; los aldeanos nunca usan antorcha.

Los fondos claros se eliminan al cargar mediante una máscara conectada a los
bordes; así se preservan los brillos internos de armaduras y armas.
