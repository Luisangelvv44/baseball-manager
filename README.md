# Baseball Manager

Juego de gestion de béisbol estilo "manager" para correr en localhost.
Backend: Node/Express + PostgreSQL. Frontend: React + Vite + Tailwind.

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

Edita `.env` con los datos de tu PostgreSQL (usuario, password, puerto, nombre de la BD).

Crea las tablas:

```bash
psql -U postgres -d baseball_manager -f db/schema.sql
```

(o usa tu cliente de PostgreSQL preferido para correr `db/schema.sql`)

Genera la liga inicial (16 equipos, rosters CPU, tu equipo vacio con $10M y estadio inicial):

```bash
npm run seed
```

Levanta el servidor (puerto 4000):

```bash
npm run dev
```

> Nota: tambien puedes regenerar la liga desde la app, en la pestaña **"Nueva Partida"**
> (esto borra todo y vuelve a correr el seed).

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
2. Ve a **Mercado** y ficha jugadores (agentes libres o, mas adelante, prospectos
   de tus scouts) hasta tener al menos 9 jugadores de campo + 1 pitcher.
3. En el **Dashboard**, presiona **"Iniciar Temporada"** para generar el calendario
   (round-robin simple: cada equipo juega una vez contra cada uno de los otros 15,
   alternando local/visitante).
4. Cada dia, presiona **"Avanzar Dia"**:
   - Si tienes partido ese dia, te llevara a la pantalla del partido para que
     presiones **"Jugar Partido"** y veas el play-by-play en vivo.
   - Si no tienes partido, se simulan automaticamente los partidos CPU vs CPU
     de ese dia y se cobran tus salarios diarios.
5. En **Estadio**, mejora tus gradas (el costo se duplica en cada nivel) o construye
   gradas nuevas en las celdas vacias. Ajusta el precio de las entradas: mas caro
   no siempre es mejor, depende de tu reputacion y capacidad.
6. En **Scouts**, contrata scouts ($50,000), envíalos a misiones (5 dias) asignando
   un presupuesto, y luego recolecta los prospectos que encuentren (apareceran en
   el Mercado, seccion "Prospectos de Scouts").
7. Revisa **Finanzas** para ver el detalle de tus ingresos y gastos.

## Notas de diseño

- **Jugadores**: cada uno tiene un "coeficiente de potencial" (mayoria 30-55, élite
  90-99 muy raro), una "edad de uso" (`growth_age = 24 + floor(potencial/10)`) hasta
  la cual sigue mejorando, y una "destreza actual" inicial basada en cuan cerca esta
  de esa edad de madurez.
- **Simulacion de partidos**: cada turno al bate se resuelve con probabilidades base
  (SO 23% > GO 16% > FO 14% > 1B 13% > BB 9% > 2B 5% > HR 4% > 3B 1%), ajustadas por
  la diferencia de destreza entre bateador y pitcher.
- **Economia**: partidos en casa generan ingresos por entradas (segun ocupacion,
  ligada a tu reputacion) + 15% de merchandising, menos costos operativos del
  estadio. Partidos de visita solo generan merchandising. Los salarios se cobran
  diariamente (salario anual / 162).
- **Calendario**: round-robin simple (metodo del circulo) con 16 equipos -> 15 dias
  de calendario, 8 partidos por dia, cada equipo juega 15 partidos en total.

## Pendiente / ideas futuras

- Lineups personalizables y rotacion de pitchers.
- Agencia libre competitiva (otros equipos CPU también fichan jugadores).
- Lesiones, moral/quimica de equipo, eventos aleatorios.
- Doble round-robin (temporada mas larga, ida y vuelta).
