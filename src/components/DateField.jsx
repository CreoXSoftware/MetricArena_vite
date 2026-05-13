import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

function parseISO(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function toISO(d) {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function DateField({
  value,
  onChange,
  className = 'filter-date',
  placeholder = 'dd/mm/yyyy',
  title,
  required,
  id,
  name,
  disabled,
  minDate,
  maxDate,
  isClearable = true,
}) {
  return (
    <DatePicker
      selected={parseISO(value)}
      onChange={d => onChange(toISO(d))}
      dateFormat="dd/MM/yyyy"
      placeholderText={placeholder}
      className={className}
      wrapperClassName="datefield-wrapper"
      calendarClassName="datefield-calendar"
      popperClassName="datefield-popper"
      title={title}
      required={required}
      id={id}
      name={name}
      disabled={disabled}
      minDate={parseISO(minDate) || undefined}
      maxDate={parseISO(maxDate) || undefined}
      isClearable={isClearable}
      showPopperArrow={false}
      autoComplete="off"
    />
  );
}
