import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './admin/Dashboard';
import Contatos from './admin/Contatos';
import Empresas from './admin/Empresas';
import Pipeline from './admin/Pipeline';
import Agenda from './admin/Agenda';
import Emails from './admin/Emails';
import Relatorios from './admin/Relatorios';
import Propostas from './admin/Propostas';
import Integracoes from './admin/Integracoes';
import WhatsApp from './admin/WhatsApp';
import BotaoWhatsApp from './admin/BotaoWhatsApp';
import Scraping from './admin/Scraping';
import PrivateRoute from './components/PrivateRoute';
import GuestRoute from './components/GuestRoute';

function App() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route path="/" element={<Login />} />
      </Route>

      <Route path="/admin" element={<PrivateRoute />}>
        <Route index element={<Dashboard />} />
        <Route path="contatos" element={<Contatos />} />
        <Route path="empresas" element={<Empresas />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="emails" element={<Emails />} />
        <Route path="whatsapp" element={<WhatsApp />} />
        <Route path="botao-whatsapp" element={<BotaoWhatsApp />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="propostas" element={<Propostas />} />
        <Route path="scraping" element={<Scraping />} />
        <Route path="integracoes" element={<Integracoes />} />
      </Route>

      <Route
        path="*"
        element={
          <div
            style={{
              minHeight: '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--vesk-bg, #0e0e0f)',
              color: 'var(--vesk-text, #f0ede8)',
              fontFamily: 'var(--font-head, sans-serif)',
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            404 — Página não encontrada
          </div>
        }
      />
    </Routes>
  );
}

export default App;
