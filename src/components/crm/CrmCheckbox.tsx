import { useEffect, useRef } from 'react';

type Props = {
  checked: boolean;
  /** Marca parcial (ex.: só alguns itens da lista selecionados). */
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
};

/** Checkbox no padrão visual do CRM: acessível (input nativo) com caixa própria, marca e estado parcial. */
const CrmCheckbox = ({ checked, indeterminate = false, onChange, ariaLabel, disabled }: Props) => {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);

  return (
    <label className="crm-check">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="crm-check-box" aria-hidden="true">
        <svg className="crm-check-tick" viewBox="0 0 16 16" focusable="false">
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
        <svg className="crm-check-dash" viewBox="0 0 16 16" focusable="false">
          <path d="M4 8h8" />
        </svg>
      </span>
    </label>
  );
};

export default CrmCheckbox;
