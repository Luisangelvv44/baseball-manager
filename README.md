# Baseball Manager

Juego de gestion de béisbol estilo "manager" para correr en localhost.
Backend: Node/Express + Prisma + PostgreSQL. Frontend: React + Vite + Tailwind.

## Requisitos

- Node.js 18+
- PostgreSQL corriendo localmente

## 1. Base de datos

Crea una base de datos vacia, por ejemplo:

```sql
CREATE DATABASE baseball_manager;
```

## 2. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edita `.env` con la cadena de conexion a tu PostgreSQL (`DATABASE_URL`) y el puerto
del servidor (`PORT`, 4000 por defecto).

Aplica las migraciones de Prisma (crea todas las tablas):

```bash
npx prisma migrate dev
```

Genera la liga inicial (16 equipos, 2 divisiones, rosters CPU, agentes libres,
empresas de transmision, tu equipo vacio con $10M y estadio inicial):

```bash
npm run seed
```

Levanta el servidor (puerto 4000):

```bash
npm run dev
```

> Nota: tambien puedes regenerar la liga desde la app, en la pestaña **"Nueva Partida"**
> (esto borra todo y vuelve a correr el seed).

Hay una suite de tests con Jest (`backend/__tests__/`) que cubre simulacion de
partidos, subastas, comercios, finanzas, impuesto de lujo, etc.:

```bash
npm test
```

## 3. Frontend

En otra terminal:

```bash
cd frontend
npm install
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173).

## Como jugar

1. Si es tu primera vez, ve a **Nueva Partida** para inicializar la liga (16 equipos,
   2 divisiones de 8). Tu equipo arranca con $10,000,000, sin jugadores ni scouts, y
   un estadio basico: 1 grada a cada lado del campo (nivel 1).
2. Ve a **Mercado** y ficha jugadores (agentes libres, prospectos de tus scouts, o
   pujando en subastas de agentes libres) hasta tener al menos 9 jugadores de campo
   + 1 pitcher. Ajusta tu alineacion en **Lineup**.
3. En el **Dashboard**, presiona **"Iniciar Temporada"** para generar el calendario
   (doble round-robin: cada equipo juega dos veces contra cada uno de los otros 15,
   una vez en casa y otra de visita).
4. Cada dia, presiona **"Avanzar Dia"**:
   - Si tienes partido ese dia, te llevara a la pantalla del partido para que
     presiones **"Jugar Partido"** y veas el play-by-play en vivo.
   - Si no tienes partido, se simulan automaticamente los partidos CPU vs CPU
     de ese dia y se cobran tus salarios diarios.
   - A lo largo de la temporada tambien se resuelven subastas de agentes libres,
     ofertas de comercio de otros equipos, el draft y ofertas de transmision;
     revisa **Mercado**, **Comercios**, **Draft** y **Transmision**.
5. Al terminar la temporada regular se juegan los **Playoffs** (los 4 mejores de
   cada division); luego se retiran los jugadores de 40+ años y arranca la siguiente
   pre-temporada.
6. En **Estadio**, mejora tus gradas (el costo se duplica en cada nivel) o construye
   gradas nuevas en las celdas vacias. Ajusta el precio de las entradas: mas caro
   no siempre es mejor, depende de tu reputacion y capacidad.
7. En **Scouts**, contrata scouts ($50,000), envíalos a misiones asignando un
   presupuesto, y luego recolecta los prospectos que encuentren (apareceran en el
   Mercado, seccion "Prospectos de Scouts"). En **Coaches**, contrata cuerpo tecnico
   para dar bonificaciones a tu roster.
8. Revisa **Finanzas** para ver el detalle de tus ingresos y gastos, y **Noticias**
   e **Historial** para el seguimiento de la liga a lo largo de las temporadas.

## Sistemas del juego

- **Subastas de agentes libres**: los equipos CPU pujan automaticamente con
  agresividad aleatoria al avanzar dias.
- **Comercios (trades)**: ofertas de otros equipos evaluadas por skill/edad/salario;
  puedes enviar, aceptar o rechazar propuestas hasta la fecha limite de comercios.
- **Draft**: pool anual de prospectos y jovenes agentes libres; los equipos CPU
  eligen automaticamente, tu eliges manualmente en tu turno.
- **Playoffs**: bracket de los 4 mejores equipos por division, con un "indice de
  desesperacion" que ajusta el comportamiento CPU en la carrera final.
- **Transmision (broadcast)**: ofertas anuales de empresas de TV/radio segun tu
  reputacion; los equipos CPU aceptan o rechazan automaticamente.
- **Coaches**: bonificaciones de bateo/pitcheo/recuperacion segun especialidad,
  con salario deducido cada temporada.
- **Home Run Derby**: evento aparte simulado swing por swing segun la destreza del
  bateador.
- **Lesiones**: probabilidad post-partido escalada por edad, con dias de recuperacion
  antes de volver a jugar.
- **Impuesto de lujo**: recargo progresivo sobre la nomina que supera el umbral de
  la liga, mas un recargo si tu costo por punto de destreza es ineficiente.
- **Noticias e Historial**: feed de hazañas (juegos sin hit, ciclos, rachas, etc.) y
  estadisticas historicas/campeones acumulados temporada a temporada.

## Notas de diseño

- **Jugadores**: cada uno tiene un "coeficiente de potencial" (mayoria 30-55, élite
  90-99 muy raro), una "edad de uso" (`growth_age = 24 + floor(potencial/10)`) hasta
  la cual sigue mejorando, y una "destreza actual" inicial basada en cuan cerca esta
  de esa edad de madurez.
- **Simulacion de partidos**: cada turno al bate se resuelve con probabilidades base
  (SO 23% > GO 16% > FO 14% > 1B 16% > BB 9% > 2B 5% > HR 3% > 3B 0.5%), ajustadas por
  la diferencia de destreza (curva no lineal `destreza^1.5`) entre bateador y pitcher.
- **Economia**: partidos en casa generan ingresos por entradas (asistencia 4-14% de
  tu base de fans en temporada regular, 14-25% en playoffs, tope = capacidad del
  estadio, precio ponderado por capacidad) + merchandising (1-5% de la base de fans
  gastando $20-50/fan), menos costo operativo (capacidad × 0.5). Partidos de visita
  solo generan merchandising. Los salarios se cobran diariamente (salario anual /
  162).
- **Calendario**: doble round-robin (metodo del circulo, ida y vuelta) con 16
  equipos -> 30 dias de calendario, 240 partidos, cada equipo juega 30 partidos en
  total (15 en casa, 15 de visita).
