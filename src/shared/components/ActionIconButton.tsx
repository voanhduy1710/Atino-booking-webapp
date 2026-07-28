type Action = "edit" | "disable" | "enable" | "delete";

const COLORS: Record<Action, string> = {
  edit: "text-[#80417A] hover:bg-[#F8F0F7]",
  disable: "text-[#A06B00] hover:bg-[#FFF8E1]",
  enable: "text-[#1a7a3e] hover:bg-[#F0FFF4]",
  delete: "text-[#CC0000] hover:bg-[#FFF0F0]",
};

function ActionIcon({ action }: { action: Action }) {
  if (action === "edit") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
        <path d="m13.5 6.5 4 4" />
      </svg>
    );
  }
  if (action === "delete") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" />
        <path d="M10 11v5M14 11v5" />
      </svg>
    );
  }
  if (action === "enable") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16 9" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m6 18 12-12" />
    </svg>
  );
}

interface Props {
  action: Action;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function ActionIconButton({
  action,
  label,
  onClick,
  disabled = false,
}: Props) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${COLORS[action]}`}
      onClick={onClick}
    >
      <ActionIcon action={action} />
    </button>
  );
}
