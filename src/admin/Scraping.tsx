import { useState } from 'react';
import CrmLayout from '../components/crm/CrmLayout';
import { api } from '../services/api';

type ScrapeResult = {
  nome: string;
  telefone: string;
  site: string;
  endereco?: string;
};

const Scraping = () => {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(30);
  const [onlyWithPhone, setOnlyWithPhone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [results, setResults] = useState<ScrapeResult[]>([]);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStatus('');
    setLoading(true);
    setResults([]);

    try {
      const data = await api.post<{ total: number; results: ScrapeResult[] }>('/scraping/maps', {
        query: query.trim(),
        limit: Number(limit) || 30,
        onlyWithPhone,
      });
      setResults(data.results || []);
      setStatus(`Concluído: ${data.total} empresa(s).`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao executar busca');
    } finally {
      setLoading(false);
    }
  };

  return (
    <CrmLayout>
      <div className="crm-page-header">
        <div>
          <div className="crm-page-title">Google Maps Scraping</div>
          <div style={{ fontSize: 12, color: 'var(--vesk-muted)', marginTop: 2 }}>
            Busque empresas e visualize nome, telefone e site em uma tabela
          </div>
        </div>
      </div>

      <div className="crm-card scrape-search-card">
        <form className="scrape-search-form" onSubmit={(e) => void runSearch(e)}>
          <div className="scrape-search-fields">
            <div className="crm-field scrape-field-query">
              <label htmlFor="scrape_query">Termo de busca</label>
              <input
                id="scrape_query"
                type="text"
                required
                placeholder="Ex.: dentistas em Curitiba"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="crm-field scrape-field-limit">
              <label htmlFor="scrape_limit">Quantidade</label>
              <input
                id="scrape_limit"
                type="number"
                min={1}
                max={60}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                disabled={loading}
              />
            </div>
          </div>

          <div className="scrape-search-actions">
            <button type="submit" className="crm-btn-primary scrape-run-btn" disabled={loading}>
              <i className="ti ti-search" aria-hidden="true" />
              {loading ? 'Buscando…' : 'Rodar busca'}
            </button>
            <label className="crm-checkbox-label scrape-headless">
              <input
                type="checkbox"
                checked={onlyWithPhone}
                onChange={(e) => setOnlyWithPhone(e.target.checked)}
                disabled={loading}
              />
              Somente com telefone
            </label>
          </div>

          {error ? (
            <div className="integration-hint scrape-status scrape-status-error">
              <i className="ti ti-alert-circle" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          {status && !error ? (
            <div className="integration-hint scrape-status scrape-status-ok">
              <i className="ti ti-check" aria-hidden="true" />
              <span>{status}</span>
            </div>
          ) : null}

          <p className="scrape-api-hint">
            Utiliza a <strong>Google Places API</strong>. Configure <code>GOOGLE_MAPS_API_KEY</code> nas variáveis do
            servidor.
          </p>
        </form>
      </div>

      <div className="crm-card scrape-results-card">
        <div className="crm-card-header" style={{ marginBottom: 12 }}>
          <i className="ti ti-list" style={{ color: 'var(--vesk-orange)', fontSize: 16 }} aria-hidden="true" />
          <div className="crm-card-title">Resultados</div>
          {results.length > 0 ? <span className="pipeline-badge">{results.length}</span> : null}
        </div>

        {results.length === 0 ? (
          <div className="kanban-empty">
            {loading ? 'Aguarde, buscando empresas…' : 'Nenhum resultado ainda. Execute uma busca acima.'}
          </div>
        ) : (
          <div className="scrape-table-wrap">
            <table className="crm-table scrape-table" aria-label="Resultados do Google Maps">
              <thead>
                <tr>
                  <th className="scrape-col-num">#</th>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>Site</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row, index) => (
                  <tr key={`${row.nome}-${index}`}>
                    <td className="scrape-col-num">{index + 1}</td>
                    <td>
                      <div className="scrape-name">{row.nome}</div>
                      {row.endereco ? <div className="scrape-address">{row.endereco}</div> : null}
                    </td>
                    <td>{row.telefone || '—'}</td>
                    <td>
                      {row.site ? (
                        <a href={row.site} target="_blank" rel="noopener noreferrer" className="scrape-site-link">
                          {row.site.replace(/^https?:\/\//, '').slice(0, 48)}
                          {row.site.length > 56 ? '…' : ''}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CrmLayout>
  );
};

export default Scraping;
