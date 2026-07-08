import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import { TeamProvider } from './context/TeamContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NewGame from './pages/NewGame.jsx';
import Roster from './pages/Roster.jsx';
import Market from './pages/Market.jsx';
import Stadium from './pages/Stadium.jsx';
import Scouts from './pages/Scouts.jsx';
import Finances from './pages/Finances.jsx';
import GameView from './pages/GameView.jsx';
import Schedule from './pages/Schedule.jsx';
import Lineup from './pages/Lineup.jsx';
import Broadcast from './pages/Broadcast.jsx';
import Playoffs from './pages/Playoffs.jsx';
import Coaches from './pages/Coaches.jsx';
import Draft from './pages/Draft.jsx';
import Stars from './pages/Stars.jsx';
import News from './pages/News.jsx';
import History from './pages/History.jsx';

export default function App() {
  return (
    <TeamProvider>
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <div className="max-w-6xl mx-auto p-4">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/newgame" element={<NewGame />} />
          <Route path="/roster" element={<Roster />} />
          <Route path="/market" element={<Market />} />
          <Route path="/stadium" element={<Stadium />} />
          <Route path="/scouts" element={<Scouts />} />
          <Route path="/finances" element={<Finances />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/lineup" element={<Lineup />} />
          <Route path="/broadcast" element={<Broadcast />} />
          <Route path="/playoffs" element={<Playoffs />} />
          <Route path="/coaches" element={<Coaches />} />
          <Route path="/draft" element={<Draft />} />
          <Route path="/stars" element={<Stars />} />
          <Route path="/news" element={<News />} />
          <Route path="/history" element={<History />} />
          <Route path="/game/:id" element={<GameView />} />
        </Routes>
      </div>
    </div>
    </TeamProvider>
  );
}
