export function formatChartDate(value: string): {
  label: string;
  weekday: string;
} {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][date.getDay()];
  return {
    label: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`,
    weekday,
  };
}
