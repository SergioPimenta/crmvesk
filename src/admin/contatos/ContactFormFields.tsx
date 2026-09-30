import type { Dispatch, SetStateAction } from 'react';
import type { Company, ContactType } from '../../contexts/CrmDataContext';
import type { ContactFormState } from './types';

type Props = {
  /** Prefixo dos ids dos campos (evita ids repetidos entre o modal de criar e o de editar). */
  idPrefix: string;
  form: ContactFormState;
  setForm: Dispatch<SetStateAction<ContactFormState>>;
  companies: Company[];
};

/** Campos comuns do contato: nome, e-mail, telefone, site, empresa e tipo. */
const ContactFormFields = ({ idPrefix, form, setForm, companies }: Props) => (
  <>
    <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
      <label htmlFor={`${idPrefix}_nome`}>Nome</label>
      <input
        id={`${idPrefix}_nome`}
        value={form.nome}
        onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
        required
      />
    </div>

    <div className="crm-field">
      <label htmlFor={`${idPrefix}_email`}>E-mail</label>
      <input
        id={`${idPrefix}_email`}
        type="email"
        value={form.email}
        onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
      />
    </div>

    <div className="crm-field">
      <label htmlFor={`${idPrefix}_tel`}>Telefone</label>
      <input
        id={`${idPrefix}_tel`}
        value={form.telefone}
        onChange={(e) => setForm((p) => ({ ...p, telefone: e.target.value }))}
      />
    </div>

    <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
      <label htmlFor={`${idPrefix}_site`}>Site</label>
      <input
        id={`${idPrefix}_site`}
        type="text"
        placeholder="https://exemplo.com.br"
        value={form.site}
        onChange={(e) => setForm((p) => ({ ...p, site: e.target.value }))}
      />
    </div>

    <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
      <label htmlFor={`${idPrefix}_emp`}>Empresa</label>
      <select
        id={`${idPrefix}_emp`}
        value={form.empresaId}
        onChange={(e) => setForm((p) => ({ ...p, empresaId: e.target.value }))}
      >
        <option value="">— Selecione —</option>
        {companies.map((co) => (
          <option key={co.id} value={co.id}>
            {co.nome}
          </option>
        ))}
      </select>
    </div>

    <div className="crm-field">
      <label htmlFor={`${idPrefix}_tipo`}>Tipo</label>
      <select
        id={`${idPrefix}_tipo`}
        value={form.tipo}
        onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value as ContactType }))}
      >
        <option value="Lead">Lead</option>
        <option value="Prospect">Prospect</option>
        <option value="Cliente">Cliente</option>
      </select>
    </div>
  </>
);

export default ContactFormFields;
