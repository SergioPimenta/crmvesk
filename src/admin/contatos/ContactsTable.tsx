import type { Contact } from '../../contexts/CrmDataContext';
import { contactOrigin } from '../../utils/contactOrigin';
import { initials } from '../../utils/initials';
import { PAGE_SIZE } from './types';

type Props = {
  rows: Contact[];
  loading: boolean;
  isAdmin: boolean;
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  ownerName: (ownerId?: number | null) => string | null;
  getCompanyName: (id?: string) => string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
};

/** Tabela de contatos (com seleção e responsável para administradores) e a paginação. */
const ContactsTable = ({
  rows,
  loading,
  isAdmin,
  selectedIds,
  onToggleSelected,
  onSelectAll,
  ownerName,
  getCompanyName,
  onEdit,
  onDelete,
  page,
  totalPages,
  total,
  onPageChange,
}: Props) => (
  <>
    <table className="crm-table" aria-label="Lista de contatos cadastrados">
      <thead>
        <tr>
          {isAdmin ? (
            <th style={{ width: 32 }}>
              <input
                type="checkbox"
                aria-label="Selecionar todos os contatos listados"
                checked={rows.length > 0 && rows.every((c) => selectedIds.has(c.id))}
                onChange={(e) => onSelectAll(e.target.checked ? rows.map((c) => c.id) : [])}
              />
            </th>
          ) : null}
          <th>Contato</th>
          <th>Telefone</th>
          <th>Site</th>
          <th>Empresa</th>
          <th>Etapa</th>
          <th>Origem</th>
          {isAdmin ? <th>Responsável</th> : null}
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id}>
            {isAdmin ? (
              <td>
                <input
                  type="checkbox"
                  aria-label={`Selecionar ${c.nome}`}
                  checked={selectedIds.has(c.id)}
                  onChange={() => onToggleSelected(c.id)}
                />
              </td>
            ) : null}
            <td>
              <div className="contact-name-cell">
                <div className={`contact-av${c.precisaFollowUp ? ' attention' : ''}`}>{initials(c.nome)}</div>
                <div className="contact-name-cell__body">
                  <div className="contact-name-cell__title">
                    <span className="contact-name-cell__name" title={c.nome}>
                      {c.nome}
                    </span>
                    {c.precisaFollowUp ? <span className="pill-attention">Novo</span> : null}
                  </div>
                  <div className="contact-name-cell__email">{c.email}</div>
                </div>
              </div>
            </td>
            <td style={{ color: 'var(--vesk-muted)' }}>{c.telefone}</td>
            <td>
              {c.site?.trim() ? (
                <a
                  href={c.site.startsWith('http') ? c.site : `https://${c.site}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="scrape-site-link"
                >
                  {c.site.replace(/^https?:\/\//, '').slice(0, 36)}
                  {c.site.length > 40 ? '…' : ''}
                </a>
              ) : (
                '—'
              )}
            </td>
            <td style={{ color: 'var(--vesk-muted)' }}>{getCompanyName(c.empresaId)}</td>
            <td>
              <span className="pill-stage">{c.etapa}</span>
            </td>
            <td style={{ color: 'var(--vesk-muted)' }}>{contactOrigin(c.ultimaInteracao)}</td>
            {isAdmin ? (
              <td style={{ color: c.ownerId ? 'var(--vesk-text)' : 'var(--vesk-muted)' }}>
                {ownerName(c.ownerId) ?? 'Sem responsável'}
              </td>
            ) : null}
            <td>
              <div className="crm-row-actions">
                <button type="button" className="crm-action-btn" onClick={() => onEdit(c.id)} aria-label={`Editar ${c.nome}`}>
                  <i className="ti ti-pencil" aria-hidden="true" />
                  Editar
                </button>
                <button
                  type="button"
                  className="crm-action-btn crm-action-btn-danger"
                  onClick={() => onDelete(c.id)}
                  aria-label={`Excluir ${c.nome}`}
                >
                  <i className="ti ti-trash" aria-hidden="true" />
                  Excluir
                </button>
              </div>
            </td>
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td colSpan={isAdmin ? 9 : 7} style={{ color: 'var(--vesk-muted)', padding: 14 }}>
              {loading ? 'Carregando…' : 'Nenhum contato encontrado.'}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>

    <div className="contacts-pagination" aria-label="Paginação de contatos">
      <span className="contacts-assign-count">
        {total === 0 ? '0 contatos' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} de ${total}`}
      </span>
      <button
        type="button"
        className="crm-action-btn"
        disabled={page <= 1 || loading}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        Anterior
      </button>
      <span className="contacts-assign-count">
        Página {page} de {totalPages}
      </span>
      <button
        type="button"
        className="crm-action-btn"
        disabled={page >= totalPages || loading}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
      >
        Próxima
      </button>
    </div>
  </>
);

export default ContactsTable;
