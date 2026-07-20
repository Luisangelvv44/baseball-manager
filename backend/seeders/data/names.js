// Nombres multiculturales (latino, anglosajon, japones, eslavo, africano, arabe, escandinavo, etc.)
// Combinacion FIRST x LAST = miles de jugadores unicos posibles.

const FIRST_NAMES = [
  'Carlos', 'Luis', 'Jose', 'Juan', 'Pedro', 'Miguel', 'Rafael', 'David',
  'Manuel', 'Diego', 'Alejandro', 'Sergio', 'Mateo', 'Pablo', 'Marcos',
  'Liam', 'Noah', 'Ethan', 'Connor', 'Jacob', 'Ryan', 'Owen', 'Dylan',
  'Mason', 'Cole', 'Hunter', 'Tyler', 'Brandon', 'Caleb', 'Wyatt',
  'Hiroshi', 'Kenji', 'Takeshi', 'Haruto', 'Ren', 'Sora', 'Yuto', 'Riku',
  'Kwame', 'Kofi', 'Sefu', 'Jabari', 'Tendai', 'Amara', 'Bakari', 'Femi',
  'Dimitri', 'Andrei', 'Boris', 'Mikhail', 'Pavel', 'Sasha', 'Viktor', 'Igor',
  'Mohammed', 'Yusuf', 'Omar', 'Tariq', 'Karim', 'Amir', 'Rashid', 'Hassan',
  'Sven', 'Erik', 'Lars', 'Mikael', 'Niklas', 'Anders', 'Bjorn', 'Henrik',
  'Luca', 'Enzo', 'Niko', 'Matteo', 'Leonardo', 'Tomas', 'Felix', 'Adrian',
  'Ravi', 'Arjun', 'Vikram', 'Sanjay', 'Rohan', 'Dev', 'Aryan', 'Kiran',
  'Connor', 'Aiden', 'Logan', 'Nathan', 'Ezra', 'Gabriel', 'Julian', 'Theo',
  'Yusei', 'Daichi', 'Kaito', 'Shun', 'Tatsuya', 'Hayato', 'Ryota', 'Sora',
  'Adebayo', 'Chidi', 'Emeka', 'Obi', 'Olu', 'Zola', 'Themba', 'Sipho',
  'Anton', 'Aleksei', 'Yevgeni', 'Roman', 'Stefan', 'Tomasz', 'Lukas', 'Marek',
  'Ahmad', 'Faisal', 'Idris', 'Jamal', 'Khalid', 'Malik', 'Nasser', 'Samir',
  'Olaf', 'Gustav', 'Magnus', 'Ragnar', 'Soren', 'Axel', 'Frode', 'Bjarne',
  'Giancarlo', 'Vincenzo', 'Salvatore', 'Dario', 'Marco', 'Stefano', 'Renzo',
  'Arjun', 'Pranav', 'Nikhil', 'Akash', 'Varun', 'Ishaan', 'Yusuke', 'Jin',
];

const LAST_NAMES = [
  'Garcia', 'Martinez', 'Rodriguez', 'Lopez', 'Hernandez', 'Gonzalez',
  'Perez', 'Sanchez', 'Ramirez', 'Torres', 'Flores', 'Rivera', 'Gomez',
  'Diaz', 'Reyes', 'Morales', 'Cruz', 'Ortiz', 'Castro', 'Romero',
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis',
  'Wilson', 'Taylor', 'Clark', 'Walker', 'Hall', 'Allen', 'Young', 'King',
  'Tanaka', 'Yamamoto', 'Sato', 'Suzuki', 'Watanabe', 'Ito', 'Nakamura',
  'Kobayashi', 'Saito', 'Matsumoto', 'Inoue', 'Kimura', 'Hayashi',
  'Mensah', 'Asante', 'Okafor', 'Adeyemi', 'Diallo', 'Mwangi', 'Okonjo',
  'Petrov', 'Ivanov', 'Volkov', 'Sokolov', 'Popov', 'Novak', 'Kowalski',
  'Müller', 'Schmidt', 'Weber', 'Becker', 'Hoffmann', 'Schneider',
  'Khan', 'Hassan', 'Ahmed', 'Ibrahim', 'Saleh', 'Mansour', 'Aziz',
  'Nilsson', 'Andersson', 'Johansson', 'Eriksson', 'Larsson', 'Persson',
  'Silva', 'Costa', 'Pereira', 'Ferreira', 'Oliveira', 'Santos', 'Souza',
  'Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Colombo', 'Marino',
  'Patel', 'Sharma', 'Singh', 'Kumar', 'Gupta', 'Mehta', 'Verma', 'Reddy',
  'Dubois', 'Lefevre', 'Moreau', 'Lambert', 'Rousseau', 'Bernard',
  'Novotny', 'Horvat', 'Kovac', 'Dvorak', 'Prochazka', 'Svoboda',
  'Botha', 'Van der Merwe', 'Pretorius', 'Nkosi', 'Dlamini', 'Khumalo',
  'Wong', 'Chen', 'Liu', 'Wang', 'Zhang', 'Li', 'Park', 'Kim', 'Choi',
];

// "Pais ficticio": equipos no en espanol, ciudades inventadas.
// Cada nombre tiene un logo SVG correspondiente en frontend/src/assets/logos/
// (kebab-case del nombre, ej. "Ostrava Bay Comets" -> ostrava-bay-comets.svg).
const TEAM_NAMES = [
  'Brisko Wolves', 'Adalveer Outlaws', 'Norhaven Sailors', 'Calderex Voyagers',
  'Veltmoor Sentinels', 'Ostrava Bay Comets', 'Sundermere Crushers', 'Ravenholt Hawks',
  'Thalgrove Miners', 'Esterfall Marauders', 'Drommel Raptors', 'Hallowmere Foxes',
  'Westvane Rebels', 'Crownridge Pioneers', 'Pellanor Giants', 'Druvask Knights',
];

module.exports = {
  FIRST_NAMES,
  LAST_NAMES,
  TEAM_NAMES,
};
