import type { TeamMember } from './types';

type Props = {
  unownedCount: number;
  onlyUnowned: boolean;
  onToggleOnlyUnowned: () => void;
  selectedCount: number;
  members: TeamMember[];
  assignTarget: string;
  onAssignTargetChange: (value: string) => void;
  assigning: boolean;
  assignError: string;
  onAssign: () => void;
  onClearSelection: () => void;
};

/** Barra do administrador: filtro "sem responsável" e atribuição de responsável aos contatos marcados. */
const OwnerAssignBar = ({
  unownedCount,
  onlyUnowned,
  onToggleOnlyUnowned,
  selectedCount,
  members,
  assignTarget,
  onAssignTargetChange,
  assigning,
  assignError,
  onAssign,
  onClearSelection,
}: Props) => (
  <div className="contacts-assign-bar">
    <span className="contacts-assign-count">{unownedCount} sem responsável</span>
    <button type="button" className={`crm-action-btn${onlyUnowned ? ' active' : ''}`} onClick={onToggleOnlyUnowned}>
      {onlyUnowned ? 'Mostrar todos' : 'Mostrar só sem responsável'}
    </button>
    {selectedCount > 0 ? (
      <>
        <span className="contacts-assign-count">{selectedCount} selecionado(s)</span>
        <select value={assignTarget} onChange={(e) => onAssignTargetChange(e.target.value)} aria-label="Atribuir a">
          <option value="">Atribuir a…</option>
          {members
            .filter((m) => m.active)
            .map((m) => (
              <option key={m.id} value={String(m.id)}>
                {m.name}
              </option>
            ))}
          <option value="none">Remover responsável</option>
        </select>
        <button type="button" className="crm-btn-primary" disabled={!assignTarget || assigning} onClick={onAssign}>
          {assigning ? 'Atribuindo…' : 'Atribuir'}
        </button>
        <button type="button" className="crm-action-btn" onClick={onClearSelection}>
          Limpar seleção
        </button>
      </>
    ) : null}
    {assignError ? <span className="contacts-assign-error">{assignError}</span> : null}
  </div>
);

export default OwnerAssignBar;
