// SmartClassroom L-419 — Nodo termico MLX90640 | V8 conteo conservador con seguimiento direccional
// Conteo de personas en puerta: deteccion por regiones conectadas + seguimiento.
// Mantener la puerta despejada durante la calibracion inicial (~3 s).
//
// Archivos que deben permanecer junto a este sketch:
//   paquetes.h debe permanecer junto al sketch; espnow_nodo.h se usa solo con ESP-NOW.
//
// Este firmware conserva el CSV que consume usb-serial-bridge.js.
// No necesita el gateway para mostrar datos por USB; envio_ok sera 0 si no hay gateway.

// 1 = envio por ESP-NOW al gateway; se mantiene la depuracion CSV por USB.
#define HABILITAR_ESPNOW 1

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_MLX90640.h>
#include <algorithm>

#include "paquetes.h"  // Define los bits de anomalía del contrato térmico.
#if HABILITAR_ESPNOW
  #include "espnow_nodo.h"
#endif

// ================= RED / GATEWAY =================
// IMPORTANTE: reemplazar con la MAC STA REAL que imprime el gateway mañana.
uint8_t MAC_GATEWAY[6] = {0x58, 0x2A, 0xBD, 0x72, 0x03, 0xDC};
const char* SSID_ROUTER = "GEMELO-L419";
const uint8_t CANAL_DEFECTO = 1;
const uint8_t NODO_ID = 5;

// ================= I2C =================
#define PIN_SDA 21
#define PIN_SCL 22

// ================= ORIENTACION =================
// false: el movimiento de entrada/salida ocurre sobre el eje vertical de 24 filas.
// En este montaje, la persona avanza de arriba hacia abajo.
#define PASO_EN_EJE_X false

// Arriba -> abajo aumenta la fila; por eso entrada = +1.
const int SENTIDO_ENTRADA = +1;

// Mapa térmico y diagnóstico por Serial.
#define DEBUG_MAPA 1
#define DEBUG_DIAG 1

// ================= DETECCION TERMICA =================
// Prioridad: no dividir el cuerpo de una persona en varias detecciones.
const float DELTA_MIN       = 1.8f;  // contraste mínimo sobre el fondo (°C)
const float K_SIGMA         = 2.5f;  // multiplicador del ruido robusto
const float UMBRAL_MAX      = 5.0f;  // techo del umbral (°C)
const float DELTA_PICO      = 3.0f;  // contraste mínimo del máximo de una región
const int   AREA_MIN        = 10;     // píxeles mínimos para aceptar una región
const float RADIO_UNIR      = 12.5f; // fusiona fragmentos cercanos de una misma silueta

// No se separa una región conectada por máximos térmicos internos.
// Dos personas solo generan pistas distintas cuando el mapa contiene
// componentes independientes suficientemente separados.

// ================= SEGUIMIENTO / CRUCE =================
const float GATE            = 16.0f; // salto máximo entre cuadros para asociar una pista
const int   MAX_PERDIDOS    = 16;    // tolera hasta ~1 s de pérdida sin romper la trayectoria
const int   VISTOS_MIN      = 2;     // la trayectoria principal se confirma en 2 cuadros
// Una segunda trayectoria solo se admite con separación longitudinal clara,
// alineación transversal y persistencia; prioriza no duplicar el cuerpo de una persona.
const float SEP_DOS_P       = 15.5f; // separación mínima sobre el eje de paso (filas)
const float SEP_DOS_Q       = 8.0f;  // ambas detecciones deben estar aproximadamente en el mismo carril
const int   PIX_MIN_SECUNDARIA = 20; // soporte térmico mínimo de la segunda persona
const int   VISTOS_MIN_SECUNDARIA = 4; // ~250 ms a 16 Hz; evita contar manchas transitorias
// Direcciones y líneas conservadas de la V5.1 probada en el aula.
const float FRAC_LINEA_A    = 0.20f; // fila 4.6
const float FRAC_LINEA_B    = 0.45f; // fila 10.3
const float FRAC_DESPL_MIN  = 0.30f;

// ================= CALIBRACION / FONDO =================
const float ALFA_FONDO      = 0.015f;
const float ALFA_FONDO_OCUP = 0.001f;
const int   N_CALIB         = 48;    // ~3 segundos a 16 Hz

// ================= ENVIO =================
const unsigned long PERIODO_MS        = 5000;
const unsigned long MIN_ENTRE_ENVIOS  = 300;
const unsigned long OBJ_ESTATICO_MS   = 60000;
const unsigned long RESET_INACTIVO_MS = 5UL * 3600UL * 1000UL;
const int FALLOS_PARA_ALARMA = 5;

// ================= GEOMETRIA / ESTADO =================
const int COLS = 32;
const int FILAS = 24;
const int NPIX = COLS * FILAS;
const int L_PASO = PASO_EN_EJE_X ? COLS : FILAS;
const float LINEA_A = FRAC_LINEA_A * (L_PASO - 1);
const float LINEA_B = FRAC_LINEA_B * (L_PASO - 1);
const float CENTRO = 0.5f * (L_PASO - 1);

Adafruit_MLX90640 mlx;
bool sensorOk = false;

float T[NPIX];
float fondo[NPIX];
float m2[NPIX];
float sigmaPix[NPIX];
float dT[NPIX];
int16_t etiqueta[NPIX];
int16_t cola[NPIX];

float umbral = DELTA_MIN;
float ruidoCalibracion = 0.0f;
int nCalib = 0;
int nRegiones = 0;
int nFusionadas = 0;

struct Deteccion {
  float p;
  float q;
  float masa;       // peso térmico acumulado
  uint16_t pixeles; // soporte total de los componentes fusionados
};

const int MAX_DET = 12;
Deteccion det[MAX_DET];
int nDet = 0;

struct Pista {
  bool activa;
  float p, q;
  float p0, pmin, pmax;
  uint8_t vistos, perdidos;
  bool contada, dudosa, secundaria;
  int8_t crucePendiente; // +1 entrada, -1 salida; espera confirmación de pista
  unsigned long t0;
};

const int MAX_PISTAS = 4;
Pista pistas[MAX_PISTAS];

// Acumuladores enviados al backend / gateway.
int ocupacion = 0;
uint16_t entradasVent = 0;
uint16_t salidasVent = 0;
uint8_t dudososVent = 0;
uint8_t maxEnVista = 0;
uint8_t anomVent = 0;
float tMaxVent = -100.0f;
bool hayEvento = false;

unsigned long tUltEnvio = 0;
unsigned long tUltActividad = 0;
unsigned long tUltReintento = 0;
int fallosSeguidos = 0;

inline float coordPaso(int c, int f) {
  return PASO_EN_EJE_X ? (float)c : (float)f;
}

inline float coordTrans(int c, int f) {
  return PASO_EN_EJE_X ? (float)f : (float)c;
}

float distPix(int i, int j) {
  float dc = (float)(i % COLS) - (float)(j % COLS);
  float df = (float)(i / COLS) - (float)(j / COLS);
  return sqrtf(dc * dc + df * df);
}

// ================= SENSOR =================
bool iniciarSensor() {
  Wire.setClock(400000);

  if (!mlx.begin(MLX90640_I2CADDR_DEFAULT, &Wire)) {
    return false;
  }

  mlx.setMode(MLX90640_CHESS);
  mlx.setResolution(MLX90640_ADC_18BIT);
  mlx.setRefreshRate(MLX90640_16_HZ);
  return true;
}

bool leerCuadro() {
  if (mlx.getFrame(T) != 0) return false;

  for (int i = 0; i < NPIX; i++) {
    if (isnan(T[i]) || T[i] < -40.0f || T[i] > 300.0f) {
      return false;
    }
  }
  return true;
}

// ================= CALIBRACION =================
// Calcula media y varianza por píxel. Para el ruido global usa la mediana
// de las desviaciones: unos pocos píxeles inestables no disparan el umbral.
void calibrar() {
  nCalib++;

  for (int i = 0; i < NPIX; i++) {
    float delta = T[i] - fondo[i];
    fondo[i] += delta / (float)nCalib;
    m2[i] += delta * (T[i] - fondo[i]);
  }

  if (nCalib == N_CALIB) {
    for (int i = 0; i < NPIX; i++) {
      float varianza = m2[i] / (float)(N_CALIB - 1);
      sigmaPix[i] = sqrtf(fmaxf(0.0f, varianza));
    }

    std::sort(sigmaPix, sigmaPix + NPIX);
    ruidoCalibracion = sigmaPix[NPIX / 2];

    umbral = K_SIGMA * ruidoCalibracion;
    if (umbral < DELTA_MIN) umbral = DELTA_MIN;
    if (umbral > UMBRAL_MAX) umbral = UMBRAL_MAX;

    Serial.printf(
      "# Calibracion lista: ruido_mediano=%.2f C, umbral=%.2f C, cuadros=%d\n",
      ruidoCalibracion, umbral, N_CALIB
    );

    if (ruidoCalibracion > 2.5f) {
      Serial.println("# AVISO: calibracion ruidosa. Despejar la puerta y reiniciar para repetirla.");
    }
  }
}

// ================= FONDO ADAPTATIVO =================
void actualizarFondo() {
  for (int i = 0; i < NPIX; i++) {
    bool ocupado = etiqueta[i] != -1;
    int c = i % COLS;
    int f = i / COLS;

    if (!ocupado) {
      if ((c > 0 && etiqueta[i - 1] != -1) ||
          (c < COLS - 1 && etiqueta[i + 1] != -1) ||
          (f > 0 && etiqueta[i - COLS] != -1) ||
          (f < FILAS - 1 && etiqueta[i + COLS] != -1)) {
        ocupado = true;
      }
    }

    float alpha = ocupado ? ALFA_FONDO_OCUP : ALFA_FONDO;
    fondo[i] += alpha * (T[i] - fondo[i]);
  }
}

// ================= DETECCIONES =================
// Fusiona componentes separados pero cercanos. No divide nunca una región
// conectada por tener varios máximos térmicos: esa fue la fuente de falsos dobles.
void agregarDeteccion(float p, float q, float masa, int pixeles) {
  if (masa < 0.01f) masa = 0.01f;

  // Primero guardamos componentes independientes. La fusión se hace al final
  // del cuadro para que sea transitiva y no dependa del orden de exploración.
  if (nDet < MAX_DET) {
    det[nDet++] = {p, q, masa, (uint16_t)pixeles};
    return;
  }

  // Si hay más de MAX_DET regiones, conservamos las de mayor masa térmica.
  int menor = 0;
  for (int i = 1; i < nDet; i++) {
    if (det[i].masa < det[menor].masa) menor = i;
  }
  if (masa > det[menor].masa) {
    det[menor] = {p, q, masa, (uint16_t)pixeles};
  }
}

void fusionarDetecciones() {
  if (nDet < 2) return;

  int padre[MAX_DET];
  for (int i = 0; i < nDet; i++) padre[i] = i;

  // Une pares usando los centroides originales. La relación es transitiva:
  // si A está cerca de B y B de C, los tres fragmentos forman una silueta.
  for (int i = 0; i < nDet; i++) {
    for (int j = i + 1; j < nDet; j++) {
      float dp = det[i].p - det[j].p;
      float dq = det[i].q - det[j].q;
      if (sqrtf(dp * dp + dq * dq) > RADIO_UNIR) continue;

      int ri = i;
      while (padre[ri] != ri) ri = padre[ri];
      int rj = j;
      while (padre[rj] != rj) rj = padre[rj];
      if (ri != rj) padre[rj] = ri;
    }
  }

  float sumaMasa[MAX_DET] = {0};
  float sumaP[MAX_DET] = {0};
  float sumaQ[MAX_DET] = {0};
  uint16_t sumaPix[MAX_DET] = {0};

  for (int i = 0; i < nDet; i++) {
    int raiz = i;
    while (padre[raiz] != raiz) raiz = padre[raiz];
    padre[i] = raiz;

    sumaMasa[raiz] += det[i].masa;
    sumaP[raiz] += det[i].p * det[i].masa;
    sumaQ[raiz] += det[i].q * det[i].masa;
    sumaPix[raiz] += det[i].pixeles;
  }

  int compactadas = 0;
  for (int i = 0; i < nDet; i++) {
    if (padre[i] != i || sumaMasa[i] <= 0.0f) continue;
    det[compactadas++] = {
      sumaP[i] / sumaMasa[i],
      sumaQ[i] / sumaMasa[i],
      sumaMasa[i],
      sumaPix[i]
    };
  }

  nFusionadas += nDet - compactadas;
  nDet = compactadas;
}

// Cada región conectada produce un centroide ponderado.
// Esto prioriza no duplicar una persona por variaciones de temperatura
// entre cabeza, hombros, ropa o distintas zonas del mismo cuerpo.
void analizarRegion(int n, int regionId) {
  (void)regionId;
  if (n < AREA_MIN) return;

  float maxDelta = -100.0f;
  float sumaPeso = 0.0f;
  float sumaP = 0.0f;
  float sumaQ = 0.0f;

  for (int k = 0; k < n; k++) {
    int i = cola[k];
    if (dT[i] > maxDelta) maxDelta = dT[i];
  }

  if (maxDelta < DELTA_PICO) return;

  for (int k = 0; k < n; k++) {
    int i = cola[k];
    int c = i % COLS;
    int f = i / COLS;

    float peso = dT[i] - umbral;
    if (peso < 0.01f) peso = 0.01f;

    sumaPeso += peso;
    sumaP += peso * coordPaso(c, f);
    sumaQ += peso * coordTrans(c, f);
  }

  if (sumaPeso > 0.0f) {
    agregarDeteccion(sumaP / sumaPeso, sumaQ / sumaPeso, sumaPeso, n);
  }
}

// Agrupa píxeles calientes en regiones conexas (vecindad de 8).
void detectar() {
  nDet = 0;
  nRegiones = 0;
  nFusionadas = 0;

  for (int i = 0; i < NPIX; i++) {
    dT[i] = T[i] - fondo[i];
    etiqueta[i] = -1;
  }

  int16_t region = 0;

  for (int s = 0; s < NPIX; s++) {
    if (etiqueta[s] != -1 || dT[s] <= umbral) continue;

    int cab = 0;
    int fin = 0;
    cola[fin++] = s;
    etiqueta[s] = region;

    while (cab < fin) {
      int i = cola[cab++];
      int c = i % COLS;
      int f = i / COLS;

      for (int df = -1; df <= 1; df++) {
        for (int dc = -1; dc <= 1; dc++) {
          if (dc == 0 && df == 0) continue;

          int cc = c + dc;
          int ff = f + df;
          if (cc < 0 || cc >= COLS || ff < 0 || ff >= FILAS) continue;

          int j = ff * COLS + cc;
          if (etiqueta[j] == -1 && dT[j] > umbral) {
            etiqueta[j] = region;
            cola[fin++] = j;
          }
        }
      }
    }

    analizarRegion(fin, region);
    nRegiones++;
    region++;
  }

  fusionarDetecciones();
}

// ================= CONTEO =================
void registrarCruce(Pista &t, int dirPaso, bool respaldo) {
  if (t.contada) return;
  t.contada = true;

  // La deduplicación se hace por trayectoria (t.contada), no con un bloqueo
  // global por tiempo. Así dos personas reales pueden cruzar con <600 ms.
  bool dudoso = respaldo || t.dudosa;
  bool esEntrada = (dirPaso * SENTIDO_ENTRADA > 0);

  if (esEntrada) {
    entradasVent++;
    ocupacion++;
  } else {
    salidasVent++;
    if (ocupacion > 0) {
      ocupacion--;
    } else {
      dudoso = true;
      anomVent |= TER_BIT_CONTEO_CORREGIDO;
    }
  }

  Serial.printf(
    "# CRUCE tipo=%s dir=%+d p0=%.1f p=%.1f rango=%.1f..%.1f respaldo=%u ocupacion=%d\n",
    esEntrada ? "ENTRADA" : "SALIDA",
    dirPaso, t.p0, t.p, t.pmin, t.pmax,
    respaldo ? 1 : 0, ocupacion
  );

  if (dudoso && dudososVent < 255) dudososVent++;
  hayEvento = true;
  tUltActividad = millis();
}

bool pistaConfirmada(const Pista &t) {
  return t.vistos >= (t.secundaria ? VISTOS_MIN_SECUNDARIA : VISTOS_MIN);
}

void evaluarCruce(Pista &t, float pAnterior) {
  if (t.contada) return;

  // Guarda la evidencia aunque la trayectoria aún no alcance VISTOS_MIN.
  // Así no se pierde una salida rápida que cruza la línea antes del tercer cuadro.
  if (t.crucePendiente == 0) {
    bool cruceEntrada = (pAnterior < LINEA_B && t.p >= LINEA_B &&
                         (t.p - pAnterior) >= 0.35f);
    bool cruceSalida  = (pAnterior > LINEA_A && t.p <= LINEA_A &&
                         (pAnterior - t.p) >= 0.35f);

    bool entradaDesdeBorde = (t.p0 >= LINEA_B - 3.0f &&
                              t.p0 <= LINEA_B + 3.0f &&
                              t.p - t.p0 >= 3.0f && t.p >= LINEA_B);
    bool salidaDesdeBorde  = (t.p0 <= LINEA_A + 3.0f &&
                              t.p0 >= LINEA_A - 3.0f &&
                              t.p0 - t.p >= 3.0f && t.p <= LINEA_A);

    bool recorridoCompletoEntrada = (t.p0 <= LINEA_A && t.p >= LINEA_B);
    bool recorridoCompletoSalida  = (t.p0 >= LINEA_B && t.p <= LINEA_A);

    if (cruceEntrada || entradaDesdeBorde || recorridoCompletoEntrada) {
      t.crucePendiente = +1;
      if (entradaDesdeBorde && !cruceEntrada) t.dudosa = true;
    } else if (cruceSalida || salidaDesdeBorde || recorridoCompletoSalida) {
      t.crucePendiente = -1;
      if (salidaDesdeBorde && !cruceSalida) t.dudosa = true;
    }
  }

  if (t.crucePendiente != 0 && pistaConfirmada(t)) {
    registrarCruce(t, t.crucePendiente, false);
  }
}

void cerrarPista(Pista &t) {
  if (!t.contada && pistaConfirmada(t)) {
    if (t.crucePendiente != 0) {
      registrarCruce(t, t.crucePendiente, true);
    } else {
      float desplazamiento = t.p - t.p0;
      bool cruzoCorredor = (t.pmin <= LINEA_A && t.pmax >= LINEA_B);

      if (cruzoCorredor &&
          fabsf(desplazamiento) >= FRAC_DESPL_MIN * (L_PASO - 1)) {
        registrarCruce(t, desplazamiento > 0 ? +1 : -1, true);
      }
    }
  }

  t.activa = false;
}

// Asociación voraz de detecciones con pistas activas.
void crearPista(int indiceDet, bool secundaria) {
  for (int p = 0; p < MAX_PISTAS; p++) {
    if (pistas[p].activa) continue;

    float pos = det[indiceDet].p;
    float trans = det[indiceDet].q;
    pistas[p] = {
      true,
      pos, trans,
      pos, pos, pos,
      1, 0, false, false, secundaria, 0, millis()
    };
    return;
  }
}

bool deteccionEsPersonaIndependiente(int indiceDet) {
  if (det[indiceDet].pixeles < PIX_MIN_SECUNDARIA) return false;

  bool hayReferencia = false;
  bool separadaDeTodas = true;

  for (int p = 0; p < MAX_PISTAS; p++) {
    if (!pistas[p].activa) continue;
    hayReferencia = true;

    float dp = fabsf(det[indiceDet].p - pistas[p].p);
    float dq = fabsf(det[indiceDet].q - pistas[p].q);

    // Dos componentes próximos en el eje de avance y en el mismo carril
    // se consideran partes de una sola silueta, no dos personas.
    if (dp < SEP_DOS_P || dq > SEP_DOS_Q) {
      separadaDeTodas = false;
      break;
    }
  }

  return hayReferencia && separadaDeTodas;
}

void actualizarPersonasEnVista() {
  uint8_t visibles = 0;
  for (int p = 0; p < MAX_PISTAS; p++) {
    if (!pistas[p].activa || !pistaConfirmada(pistas[p])) continue;
    if (pistas[p].perdidos > 2) continue;
    visibles++;
  }
  if (visibles > maxEnVista) maxEnVista = visibles;
}

void seguir() {
  bool usada[MAX_DET] = {false};
  bool actualizada[MAX_PISTAS] = {false};

  // Asociación global por menor distancia para evitar que dos pistas
  // reclamen la misma detección.
  while (true) {
    float mejor = GATE;
    int mejorPista = -1;
    int mejorDet = -1;

    for (int p = 0; p < MAX_PISTAS; p++) {
      if (!pistas[p].activa || actualizada[p]) continue;

      for (int d = 0; d < nDet; d++) {
        if (usada[d]) continue;

        float dp = det[d].p - pistas[p].p;
        float dq = det[d].q - pistas[p].q;
        float distancia = sqrtf(dp * dp + dq * dq);

        if (distancia < mejor) {
          mejor = distancia;
          mejorPista = p;
          mejorDet = d;
        }
      }
    }

    if (mejorPista < 0) break;

    Pista &t = pistas[mejorPista];
    float pAnterior = t.p;
    t.p = det[mejorDet].p;
    t.q = det[mejorDet].q;
    t.pmin = fminf(t.pmin, t.p);
    t.pmax = fmaxf(t.pmax, t.p);
    if (t.vistos < 255) t.vistos++;
    t.perdidos = 0;

    usada[mejorDet] = true;
    actualizada[mejorPista] = true;
    evaluarCruce(t, pAnterior);
  }

  for (int p = 0; p < MAX_PISTAS; p++) {
    if (pistas[p].activa && !actualizada[p]) {
      pistas[p].perdidos++;
      if (pistas[p].perdidos > MAX_PERDIDOS) {
        cerrarPista(pistas[p]);
      }
    }
  }

  // Crea primero la pista principal con la región de mayor masa térmica.
  // Las demás detecciones solo abren una pista secundaria si están claramente
  // separadas a lo largo del eje de paso y persisten en cuadros posteriores.
  bool procesada[MAX_DET] = {false};
  for (int k = 0; k < nDet; k++) {
    int mejor = -1;
    float mayorMasa = -1.0f;
    for (int d = 0; d < nDet; d++) {
      if (procesada[d] || usada[d]) continue;
      if (det[d].masa > mayorMasa) {
        mayorMasa = det[d].masa;
        mejor = d;
      }
    }
    if (mejor < 0) break;
    procesada[mejor] = true;

    bool hayPista = false;
    for (int p = 0; p < MAX_PISTAS; p++) {
      if (pistas[p].activa) { hayPista = true; break; }
    }

    if (!hayPista) {
      crearPista(mejor, false);
    } else if (deteccionEsPersonaIndependiente(mejor)) {
      crearPista(mejor, true);
    }
    // Si no cumple el criterio, se descarta como fragmento de la silueta
    // ya seguida. No genera una segunda persona ni incrementa personas_en_vista.
  }

  actualizarPersonasEnVista();
}

// Imprime el estado de cada seguimiento activo para verificar el cruce.
void imprimirDiagnosticoSeguimiento() {
#if DEBUG_DIAG
  static unsigned long ultimoTrack = 0;
  if (millis() - ultimoTrack < 1000) return;
  ultimoTrack = millis();

  int activas = 0;
  for (int i = 0; i < MAX_PISTAS; i++) {
    if (!pistas[i].activa) continue;
    activas++;
    Serial.printf(
      "# TRACK id=%d p0=%.1f p=%.1f q=%.1f vistos=%u perdidos=%u "
      "contada=%u tipo=%s rango=%.1f..%.1f\n",
      i, pistas[i].p0, pistas[i].p, pistas[i].q, pistas[i].vistos,
      pistas[i].perdidos, pistas[i].contada ? 1 : 0,
      pistas[i].secundaria ? "secundaria" : "principal",
      pistas[i].pmin, pistas[i].pmax
    );
  }
  if (activas == 0) {
    Serial.println("# TRACK sin_pistas_activas");
  }
#endif
}

// ================= DIAGNOSTICO =================
void imprimirDiagnosticoDeteccion() {
#if DEBUG_DIAG
  static unsigned long ultimo = 0;
  if (millis() - ultimo < 1000) return;
  ultimo = millis();

  float maxDelta = -100.0f;
  int idxMax = 0;
  int pixUmbral = 0;
  int pixPico = 0;

  for (int i = 0; i < NPIX; i++) {
    if (dT[i] > maxDelta) {
      maxDelta = dT[i];
      idxMax = i;
    }
    if (dT[i] > umbral) pixUmbral++;
    if (dT[i] > DELTA_PICO) pixPico++;
  }

  Serial.printf(
    "# DIAG ruido=%.2f umbral=%.2f max_dT=%.2f "
    "pix_umbral=%d pix_pico=%d regiones=%d detecciones=%d fusionadas=%d "
    "pixel_max=(%d,%d) T=%.2f fondo=%.2f\n",
    ruidoCalibracion, umbral, maxDelta,
    pixUmbral, pixPico, nRegiones, nDet, nFusionadas,
    idxMax % COLS, idxMax / COLS,
    T[idxMax], fondo[idxMax]
  );
#endif
}

void imprimirMapa() {
#if DEBUG_MAPA
  static unsigned long ultimo = 0;
  if (millis() - ultimo < 1000) return;
  ultimo = millis();

  int lineaA = (int)roundf(LINEA_A);
  int lineaB = (int)roundf(LINEA_B);

  Serial.printf(
    "# ---- mapa: '#' caliente, '+' sobre umbral, lineas A/B | detecciones=%d ----\n",
    nDet
  );

  for (int f = 0; f < FILAS; f++) {
    char linea[COLS + 1];

    for (int c = 0; c < COLS; c++) {
      float delta = dT[f * COLS + c];
      char ch = ' ';

      if (delta > DELTA_PICO + 2.0f) ch = '#';
      else if (delta > umbral) ch = '+';
      else if (delta > umbral * 0.5f) ch = '.';

      int pos = PASO_EN_EJE_X ? c : f;
      if (ch == ' ' && (pos == lineaA || pos == lineaB)) {
        ch = PASO_EN_EJE_X ? '|' : '-';
      }

      linea[c] = ch;
    }

    linea[COLS] = '\0';
    Serial.print("# ");
    Serial.println(linea);
  }
#endif
}

// ================= PROCESAMIENTO =================
void procesarCuadro() {
  float tmax = -100.0f;
  for (int i = 0; i < NPIX; i++) {
    if (T[i] > tmax) tmax = T[i];
  }
  if (tmax > tMaxVent) tMaxVent = tmax;

  if (nCalib < N_CALIB) {
    calibrar();
    return;
  }

  detectar();
  imprimirDiagnosticoDeteccion();
  seguir();
  imprimirDiagnosticoSeguimiento();

  // maxEnVista se calcula con trayectorias confirmadas, no con regiones crudas.
  for (int p = 0; p < MAX_PISTAS; p++) {
    if (pistas[p].activa &&
        millis() - pistas[p].t0 > OBJ_ESTATICO_MS) {
      anomVent |= TER_BIT_OBJETO_ESTATICO;
    }
  }

  actualizarFondo();
  imprimirMapa();
}

// ================= ENVIO =================
void enviar() {
  float temperaturaFondo = 0.0f;
  for (int i = 0; i < NPIX; i++) {
    temperaturaFondo += fondo[i];
  }
  temperaturaFondo /= (float)NPIX;

  uint8_t envioOk = 0;
  uint8_t calibrando = nCalib < N_CALIB ? 1 : 0;
  float tFondo = nCalib > 0 ? temperaturaFondo : NAN;
  float tMax = tMaxVent > -100.0f ? tMaxVent : NAN;

#if HABILITAR_ESPNOW
  PaqueteTermico p = {};
  llenarCabecera(p.h, TIPO_TERMICO, NODO_ID);
  p.entradas = entradasVent;
  p.salidas = salidasVent;
  p.ocupacion_est = (int16_t)ocupacion;
  p.personas_en_vista = maxEnVista;
  p.cruces_dudosos = dudososVent;
  p.t_fondo = tFondo;
  p.t_max = tMax;
  p.calibrando = calibrando;
  p.anomalias = anomVent;
  espnowEnviar(&p, sizeof(p));
  envioOk = g_ultimoOk ? 1 : 0;
#endif

  // CSV compatible con backend-mqtt-bridge/usb-serial-bridge.js.
  Serial.printf(
    "%lu,%u,%u,%d,%u,%u,%.2f,%.2f,%u,0x%02X,%u\n",
    millis(),
    entradasVent,
    salidasVent,
    ocupacion,
    maxEnVista,
    dudososVent,
    tFondo,
    tMax,
    calibrando,
    anomVent,
    envioOk
  );

  entradasVent = 0;
  salidasVent = 0;
  dudososVent = 0;
  maxEnVista = 0;
  anomVent = 0;
  tMaxVent = -100.0f;
  hayEvento = false;
  tUltEnvio = millis();
}

// ================= SETUP / LOOP =================
void setup() {
  Serial.begin(115200);
  delay(500);

  Wire.begin(PIN_SDA, PIN_SCL);

#if HABILITAR_ESPNOW
  if (!espnowIniciar(MAC_GATEWAY, SSID_ROUTER, CANAL_DEFECTO)) {
    Serial.println("# AVISO: no se pudo iniciar ESP-NOW; el conteo USB puede seguir funcionando.");
  }
  Serial.printf(
    "# Nodo termico id=%d MAC=%s canal=%d\n",
    NODO_ID, WiFi.macAddress().c_str(), g_canal
  );
#else
  Serial.printf("# Nodo termico id=%d | modo USB local | ESP-NOW desactivado\n", NODO_ID);
#endif

  Serial.printf(
    "# Lineas: A=%.1f B=%.1f | entrada=+1 | fusion=%.1f px | segunda_pista>=%.1f filas | sin bloqueo temporal\n",
    LINEA_A, LINEA_B, RADIO_UNIR, SEP_DOS_P
  );

  sensorOk = iniciarSensor();

  if (!sensorOk) {
    Serial.println("# ERROR: no se detecta el MLX90640 (SDA=21, SCL=22, 3.3V).");
  }

  Serial.println("# Calibrando fondo: puerta despejada y sin personas durante ~3 s.");
  Serial.println("# Umbral robusto: mediana del ruido, limitado a 5.0 C.");
  Serial.println(
    "ms,entradas,salidas,ocupacion_est,personas_en_vista,cruces_dudosos,"
    "t_fondo,t_max,calibrando,anomalias,envio_ok"
  );

  tUltEnvio = millis();
  tUltActividad = millis();
}

void loop() {
  if (!sensorOk) {
    anomVent |= TER_BIT_FALLO;

    if (millis() - tUltReintento > 10000) {
      tUltReintento = millis();
      sensorOk = iniciarSensor();
      if (sensorOk) {
        Serial.println("# MLX90640 reconectado; reiniciar para recalibrar el fondo.");
      }
    }

    delay(100);
  } else if (leerCuadro()) {
    fallosSeguidos = 0;
    procesarCuadro();
  } else {
    fallosSeguidos++;
    if (fallosSeguidos >= FALLOS_PARA_ALARMA) {
      anomVent |= TER_BIT_FALLO;
    }
  }

  // Protección por inactividad: conserva el comportamiento del firmware original.
  if (ocupacion > 0 &&
      millis() - tUltActividad > RESET_INACTIVO_MS) {
    ocupacion = 0;
    anomVent |= TER_BIT_CONTEO_CORREGIDO;
    tUltActividad = millis();
  }

  bool porPeriodo = (millis() - tUltEnvio >= PERIODO_MS);
  bool porEvento = hayEvento &&
                   (millis() - tUltEnvio >= MIN_ENTRE_ENVIOS);

  if (porPeriodo || porEvento) {
    enviar();
  }
}
