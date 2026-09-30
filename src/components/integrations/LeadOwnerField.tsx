import { useEffect, useState } from 'react';
import { api } from '../../services/api';

type Member = { id: number; name: string; role: 'admin' | 'user'; active: boolean };

/** Valor do seletor: '' = sem responsável, 'rr' = rodízio entre usuários, ou o id de um usuário. */
export const ownerValueFrom = (widget: { ownerUserId?: string | null; ownerRoundRobin?: boolean }) =>
  widget.ownerRoundRobin ? 'rr' : widget.ownerUserId ? String(widget.ownerUserId) : '';

export const ownerPayload = (value: string) => ({
  ownerUserId: value && value !== 'rr' ? Number(value) : null,
  ownerRoundRobin: value === 'rr',
});

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
};

const LeadOwnerField = ({ id, value, onChange }: Props) => {
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    void api
      .get<Member[]>('/users')
      .then((list) => setMembers(list.filter((m) => m.active)))
      .catch(() => setMembers([]));
  }, []);

  return (
    <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
      <label htmlFor={id}>Responsável pelos leads</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Sem responsável (só administradores veem)</option>
        <option value="rr">Rodízio entre os usuários</option>
        {members.map((m) => (
          <option key={m.id} value={String(m.id)}>
            {m.name}
            {m.role === 'admin' ? ' (administrador)' : ''}
          </option>
        ))}
      </select>
      <small style={{ color: 'var(--vesk-muted)', fontSize: 11 }}>
        Usuários comuns só enxergam os leads que são deles. No rodízio, cada novo lead vai para o usuário comum que
        está há mais tempo sem receber um.
      </small>
    </div>
  );
};

export default LeadOwnerField;
