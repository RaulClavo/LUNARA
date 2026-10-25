# LUNARA

## Introducción

LUNARA es una aplicación web estática para simular la iluminación y las temperaturas de la superficie lunar.

## Qué Hace

- Calcula la visibilidad del Sol y la Tierra.
- Estima temperaturas mediante la ley de Stefan-Boltzmann.
- Muestra gráficos y telemetría lunar.
- Busca ubicaciones según criterios de iluminación y temperatura.

## Cómo Funciona

Python y SpiceyPy precalculan las posiciones astronómicas entre 1995 y 2055, JavaScript interpola los datos y realiza los cálculos.

## Estructura del Proyecto

```text
LUNARA/
├── index.html
├── css/main.css
├── js/main.js
├── data/
│   ├── positions.json
│   ├── presets.json
│   ├── de440s.bsp
│   ├── naif0012.tls
│   └── pck00011.tpc
├── gen_pos.py
├── requirements.txt
└── README.md
```


## Precisión

Los cálculos utilizan kernels NASA/JPL e interpolación horaria, las temperaturas son estimaciones simplificadas y no sustituyen modelos térmicos ni análisis profesionales de misiones.