# EC3 — Dashboard Smart Classroom L-419

## Qué cambia

El dashboard deja de recibir y dibujar la matriz de 32 × 24 del MLX90640. El nodo térmico ejecuta localmente el algoritmo de conteo y transmite únicamente el paquete resumido `PaqueteTermico`:

- `entradas` y `salidas`: cruces contados desde el envío anterior.
- `ocupacion_est`: ocupación acumulada estimada por el nodo.
- `personas_en_vista`: máximo de personas detectadas en la ventana.
- `cruces_dudosos`: cruces de baja confianza.
- `calibrando` y `anomalias`: estado del algoritmo.

El dashboard suma `entradas` y `salidas` desde que se abre la interfaz; la ocupación actual se toma de `ocupacion_est`.

## Nodos contemplados en la arquitectura

| Nodo | Tipo | Sensor | Tema MQTT | Estado del archivo recibido |
|---|---|---|---|---|
| 1 | CO₂ | MH-Z1911A | `.../nodo1/co2` | `nodo_co2.ino` incluido |
| 2 | Audio | INMP441 | `.../nodo2/audio` | `nodo_audio.ino` incluido |
| 3 | Gas / humo | MQ-2 | `.../nodo3/gas` | El protocolo está en el Gateway; falta `nodo_gas.ino` en el ZIP |
| 4 | Luz | BH1750 | `.../nodo4/luz` | `nodo_luz.ino` incluido |
| 5 | Conteo | MLX90640 | `.../nodo5/termico` | `nodo_termico.ino` incluido |
| 6 | Puerta | KY-024 Hall | `.../nodo6/magnetico` | `nodo_magnetico.ino` incluido |
| 7 | Ambiente | GY-BME280 | `.../nodo7/ambiente` | `nodo_ambiente.ino` incluido |

El frontend ya tiene una tarjeta para el nodo 3 y entiende el formato `PaqueteGas`, pero no inventa lecturas: hasta que el nodo publique datos, la tarjeta aparece como pendiente. Si el detector de humo que se instalará es Tuya y no un MQ-2 conectado a ESP-NOW, necesitará una integración propia para publicar en este tema MQTT.

## Contrato MQTT del Gateway

El Gateway publica en:

`utec/gemelo/<grupo>/nodo<número>/<tipo>`

El puente se suscribe a `utec/gemelo/+/+/+`, por lo que no necesita fijar el nombre del grupo.

El JSON de cada tipo usa los nombres de campo que construye `gateway.ino`:

- `co2`: `co2_ppm`, `delta_30s`, `temp_c`, `calentando`, `nivel`, `anomalias`.
- `audio`: `leq_db`, `lmax_db`, `pico_db`, `base_db`, `freq_dom_hz`, `tonal`, `bloques_fuertes`, `calibrando`, `anomalias`.
- `termico`: `entradas`, `salidas`, `ocupacion_est`, `personas_en_vista`, `cruces_dudosos`, `t_fondo`, `t_max`, `calibrando`, `anomalias`.
- `magnetico`: `puerta_abierta`, `aperturas`, `seg_abierta`, `campo_raw`, `anomalias`.
- `ambiente`: `temp_c`, `hum_pct`, `pres_hpa`, `anomalias`.
- `luz`: `lux`, `lux_min`, `lux_max`, `lux_mesa_est`, `luces_cambio`, `anomalias`.
- `gas`: `v_ao`, `rs_r0`, `do_alarma`, `calentando`, `anomalias`.

## Umbrales usados en la interfaz

- CO₂: normal por debajo de **800 ppm** (umbral acordado para EC3); advertencia desde 800 ppm; crítico desde 1500 ppm (umbral crítico que aparece en el firmware del nodo).
- Ambiente: temperatura de confort **20–26 °C**, humedad alta por encima de **70 %**, cambio rápido superior a **1.5 °C en 5 minutos**. Son los valores del `nodo_ambiente.ino`.
- Luz: advertencia cuando `lux_mesa_est` está por debajo de **300 lux**. El firmware estima la iluminancia de mesa a partir de la lectura del techo.
- Puerta: apertura prolongada después de **10 minutos**, según `nodo_magnetico.ino`.
- Audio: no se impone un límite fijo de dB en el dashboard. Se muestran las anomalías que calcula el algoritmo del nodo (impacto, ruido sostenido o ruido mecánico).
- Conteo térmico: se muestra la ocupación y se advierte si hay cruces dudosos o fallo del sensor.
- Gas / humo: alarma crítica si `do_alarma = 1` o llega `GAS_DETECTADO`.

**Nota sobre CO₂:** el frontend aplica el umbral de 800 ppm aunque el `nodo_co2.ino` del ZIP todavía define `CO2_ALERTA_PPM = 1000`. Para que también coincidan el campo `nivel` y las anomalías que calcula el nodo, más adelante hay que cambiar ese valor del firmware a 800. El umbral crítico de 1500 ppm se conserva.

## Puente MQTT → WebSocket

El navegador no puede consumir directamente el socket TCP MQTT del puerto 1883. Este proyecto añade `backend-mqtt-bridge`, un adaptador pequeño y nuevo (no reutiliza el backend antiguo):

1. Se suscribe al broker MQTT.
2. Reenvía cada mensaje como JSON por `ws://<host>:3001/ws/telemetry`.
3. Expone `http://<host>:3001/health` para comprobar la conexión.

### Arranque

En `backend-mqtt-bridge`:

```powershell
npm install
Copy-Item .env.example .env
```

Si el broker está en la misma computadora, dejar `MQTT_URL=mqtt://127.0.0.1:1883`.

Si el broker está en otra computadora, editar `.env` y colocar la IP de esa computadora, por ejemplo:

```env
MQTT_URL=mqtt://10.100.108.161:1883
```

Luego ejecutar:

```powershell
npm start
```

En otra terminal:

```powershell
cd ..\frontend
npm run dev
```

El frontend usa por defecto `ws://<host-del-navegador>:3001/ws/telemetry`. Si el puente corre en otra computadora, crear `frontend/.env` con:

```env
VITE_TELEMETRY_WS_URL=ws://IP_DEL_PUENTE:3001/ws/telemetry
```

## Archivos térmicos antiguos

`ThermalViewer.jsx`, `ColorScaleBar.jsx`, `useThermalStream.js` y `utils/colormap.js` dejan de utilizarse. Se pueden borrar una vez verificado que el dashboard nuevo compila.

## Alcance de seguridad

El ZIP del servidor usa Mosquitto con acceso anónimo para pruebas. Ejecutar el puente solo en una red de laboratorio confiable; no exponer el broker ni el WebSocket a Internet.
